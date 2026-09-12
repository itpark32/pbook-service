package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi"
)

var institutionTypes = map[string]bool{
	"school":                true,
	"college":               true,
	"university":            true,
	"public_supplementary":  true,
	"private_supplementary": true,
	"tutor":                 true,
	"self_study":            true,
	"other":                 true,
}

func (s *authService) limit(action string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.allowAttempt(r, action) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "Слишком много попыток. Попробуйте позже.")
			return
		}
		next(w, r)
	}
}

type inviteRecord struct {
	ID          int64
	Type        string
	CreatorID   int64
	GroupID     *int64
	GroupName   *string
	CreatorName *string
	ExpiresAt   *time.Time
}

func (s *authService) activeInvite(token string) (*inviteRecord, error) {
	row := s.db.QueryRow(`SELECT i.id,i.type,i.created_by_user_id,i.group_id,g.name,creator.full_name,i.expires_at
		FROM invites i
		JOIN users creator ON creator.id=i.created_by_user_id AND creator.status='active'
		LEFT JOIN groups g ON g.id=i.group_id AND g.teacher_id=i.created_by_user_id
		WHERE i.token_hash=$1
		  AND i.revoked_at IS NULL
		  AND ((i.type='teacher' AND i.used_at IS NULL AND i.expires_at>now()) OR i.type='student')`, tokenHash(token))
	var invite inviteRecord
	if err := row.Scan(&invite.ID, &invite.Type, &invite.CreatorID, &invite.GroupID, &invite.GroupName, &invite.CreatorName, &invite.ExpiresAt); err != nil {
		return nil, err
	}
	if invite.Type == "student" && (invite.GroupID == nil || invite.GroupName == nil) {
		return nil, sql.ErrNoRows
	}
	return &invite, nil
}

func publicInvite(invite *inviteRecord) map[string]interface{} {
	response := map[string]interface{}{"type": invite.Type}
	if invite.Type == "teacher" {
		response["expiresAt"] = invite.ExpiresAt
		return response
	}
	response["group"] = map[string]interface{}{"id": invite.GroupID, "name": invite.GroupName}
	response["teacherName"] = invite.CreatorName
	return response
}

func (s *authService) showInvite(w http.ResponseWriter, r *http.Request) {
	invite, err := s.activeInvite(chi.URLParam(r, "token"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invalid_invite", "Приглашение недействительно или устарело.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"invite": publicInvite(invite)})
}

func (s *authService) inviteURL(token string) string {
	base := strings.TrimRight(s.appOrigin, "/")
	return base + "/invite/" + token
}

func (s *authService) createTeacherInvite(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return
	}
	if user.Role != "admin" && !(user.Role == "teacher" && user.VerifiedAt != nil) {
		writeError(w, http.StatusForbidden, "forbidden", "Недостаточно прав для создания приглашения преподавателю.")
		return
	}
	token, err := randomToken()
	if err != nil {
		serverError(w, err)
		return
	}
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if _, err = s.db.Exec(`INSERT INTO invites(type,token_hash,created_by_user_id,expires_at) VALUES('teacher',$1,$2,$3)`, tokenHash(token), user.ID, expiresAt); err != nil {
		serverError(w, err)
		return
	}
	inviteURL := s.inviteURL(token)
	log.Printf("DEV teacher invite created by user %d: %s", user.ID, inviteURL)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"type": "teacher", "url": inviteURL, "expiresAt": expiresAt})
}

func (s *authService) createGroup(w http.ResponseWriter, r *http.Request) {
	user, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	var input struct{ Name string }
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 160 {
		writeError(w, http.StatusBadRequest, "invalid_group", "Название группы должно содержать от 1 до 160 символов.")
		return
	}
	var id int64
	if err := s.db.QueryRow(`INSERT INTO groups(teacher_id,name) VALUES($1,$2) RETURNING id`, user.ID, name).Scan(&id); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"group": map[string]interface{}{"id": id, "name": name}})
}

func (s *authService) createStudentInvite(w http.ResponseWriter, r *http.Request) {
	user, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	groupID, err := routeID(r, "groupID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_group", "Некорректная группа.")
		return
	}
	var groupExists bool
	if err = s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM groups WHERE id=$1 AND teacher_id=$2)`, groupID, user.ID).Scan(&groupExists); err != nil {
		serverError(w, err)
		return
	}
	if !groupExists {
		writeError(w, http.StatusForbidden, "forbidden", "Группа недоступна.")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`UPDATE invites SET revoked_at=now() WHERE group_id=$1 AND type='student' AND revoked_at IS NULL`, groupID); err != nil {
		serverError(w, err)
		return
	}
	token, err := randomToken()
	if err != nil {
		serverError(w, err)
		return
	}
	if _, err = tx.Exec(`INSERT INTO invites(type,token_hash,created_by_user_id,group_id) VALUES('student',$1,$2,$3)`, tokenHash(token), user.ID, groupID); err != nil {
		serverError(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	inviteURL := s.inviteURL(token)
	log.Printf("DEV student invite created for group %d: %s", groupID, inviteURL)
	writeJSON(w, http.StatusCreated, map[string]interface{}{"type": "student", "url": inviteURL})
}

func (s *authService) revokeInvite(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return
	}
	invite, err := s.activeInvite(chi.URLParam(r, "token"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invalid_invite", "Приглашение недействительно или устарело.")
		return
	}
	if user.Role != "admin" && user.ID != invite.CreatorID {
		writeError(w, http.StatusForbidden, "forbidden", "Нельзя отозвать чужое приглашение.")
		return
	}
	if _, err = s.db.Exec(`UPDATE invites SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL`, invite.ID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type registrationInput struct {
	Email                string `json:"email"`
	Password             string `json:"password"`
	PasswordConfirmation string `json:"passwordConfirmation"`
	FullName             string `json:"fullName"`
	BirthYear            int    `json:"birthYear"`
	City                 string `json:"city"`
	InstitutionName      string `json:"institutionName"`
	InstitutionType      string `json:"institutionType"`
	ClassOrGroup         string `json:"classOrGroup"`
}

func (input *registrationInput) validate(role string) error {
	input.Email = normalizeEmail(input.Email)
	input.FullName = strings.TrimSpace(input.FullName)
	input.City = strings.TrimSpace(input.City)
	input.InstitutionName = strings.TrimSpace(input.InstitutionName)
	input.InstitutionType = strings.TrimSpace(input.InstitutionType)
	input.ClassOrGroup = strings.TrimSpace(input.ClassOrGroup)
	if input.Email == "" || !strings.Contains(input.Email, "@") {
		return fmt.Errorf("укажите корректный email")
	}
	if input.Password != input.PasswordConfirmation {
		return fmt.Errorf("пароли не совпадают")
	}
	if _, err := passwordHash(input.Password); err != nil {
		return err
	}
	if input.FullName == "" || input.City == "" {
		return fmt.Errorf("укажите ФИО и город")
	}
	if input.BirthYear < 1900 || input.BirthYear > time.Now().Year() {
		return fmt.Errorf("укажите корректный год рождения")
	}
	if !institutionTypes[input.InstitutionType] {
		return fmt.Errorf("укажите тип образовательной организации")
	}
	nameRequired := input.InstitutionType == "school" || input.InstitutionType == "college" || input.InstitutionType == "university" || input.InstitutionType == "public_supplementary" || input.InstitutionType == "private_supplementary"
	if nameRequired && input.InstitutionName == "" {
		return fmt.Errorf("укажите образовательную организацию")
	}
	if role == "student" && input.ClassOrGroup == "" {
		return fmt.Errorf("укажите класс или группу")
	}
	return nil
}

func (s *authService) registerFromInvite(w http.ResponseWriter, r *http.Request) {
	invite, err := s.activeInvite(chi.URLParam(r, "token"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invalid_invite", "Приглашение недействительно или устарело.")
		return
	}
	role := invite.Type
	var input registrationInput
	if !decodeJSON(w, r, &input) {
		return
	}
	if err = input.validate(role); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_registration", err.Error())
		return
	}
	hash, err := passwordHash(input.Password)
	if err != nil {
		serverError(w, err)
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var userID int64
	invitedBy := interface{}(nil)
	if role == "teacher" {
		invitedBy = invite.CreatorID
		var consumedID int64
		err = tx.QueryRow(`UPDATE invites SET used_at=now() WHERE id=$1 AND type='teacher' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING id`, invite.ID).Scan(&consumedID)
		if err != nil {
			writeError(w, http.StatusConflict, "invalid_invite", "Приглашение уже использовано или недействительно.")
			return
		}
	} else if err = activeStudentInviteTx(tx, invite.ID); err != nil {
		writeError(w, http.StatusConflict, "invalid_invite", "Приглашение уже недействительно.")
		return
	}
	err = tx.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,birth_year,city,institution_name,institution_type,class_or_group,invited_by_user_id)
		VALUES($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10) RETURNING id`, input.Email, hash, role, input.FullName, input.BirthYear, input.City, nullableString(input.InstitutionName), input.InstitutionType, nullableString(input.ClassOrGroup), invitedBy).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusConflict, "account_exists", "Аккаунт с таким email уже существует. Войдите, чтобы принять приглашение.")
		return
	}
	if role == "student" {
		if _, err = tx.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2)`, *invite.GroupID, userID); err != nil {
			serverError(w, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	verificationToken, err := s.issueToken(userID, "verify_email", 24*time.Hour)
	if err != nil {
		serverError(w, err)
		return
	}
	log.Printf("DEV verification link for %s: %s", input.Email, s.tokenURL("/verify-email", verificationToken))
	if err = s.startSession(w, userID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]interface{}{"ok": true, "role": role})
}

func (s *authService) joinInvite(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return
	}
	invite, err := s.activeInvite(chi.URLParam(r, "token"))
	if err != nil {
		writeError(w, http.StatusNotFound, "invalid_invite", "Приглашение недействительно или устарело.")
		return
	}
	if invite.Type == "student" {
		if user.Role != "student" {
			writeError(w, http.StatusConflict, "invite_not_applicable", "Приглашение для учеников нельзя принять с этой ролью.")
			return
		}
		tx, beginErr := s.db.Begin()
		if beginErr != nil {
			serverError(w, beginErr)
			return
		}
		defer tx.Rollback()
		if err = activeStudentInviteTx(tx, invite.ID); err != nil {
			writeError(w, http.StatusConflict, "invalid_invite", "Приглашение уже недействительно.")
			return
		}
		if _, err = tx.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, *invite.GroupID, user.ID); err != nil {
			serverError(w, err)
			return
		}
		if err = tx.Commit(); err != nil {
			serverError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if user.Role == "teacher" {
		writeError(w, http.StatusConflict, "already_teacher", "Вы уже преподаватель; это приглашение не требуется.")
		return
	}
	if user.Role != "student" {
		writeError(w, http.StatusConflict, "invite_not_applicable", "Приглашение преподавателю нельзя принять с этой ролью.")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var consumedID int64
	err = tx.QueryRow(`UPDATE invites SET used_at=now() WHERE id=$1 AND type='teacher' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING id`, invite.ID).Scan(&consumedID)
	if err != nil {
		writeError(w, http.StatusConflict, "invalid_invite", "Приглашение уже использовано или недействительно.")
		return
	}
	if _, err = tx.Exec(`UPDATE users SET role='teacher',invited_by_user_id=$1,updated_at=now() WHERE id=$2`, invite.CreatorID, user.ID); err != nil {
		serverError(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "role": "teacher"})
}

func activeStudentInviteTx(tx *sql.Tx, inviteID int64) error {
	var id int64
	return tx.QueryRow(`SELECT i.id
		FROM invites i
		JOIN users creator ON creator.id=i.created_by_user_id AND creator.status='active'
		JOIN groups g ON g.id=i.group_id AND g.teacher_id=i.created_by_user_id
		WHERE i.id=$1 AND i.type='student' AND i.revoked_at IS NULL
		FOR UPDATE OF i`, inviteID).Scan(&id)
}

func (s *authService) verifiedTeacher(w http.ResponseWriter, r *http.Request) (*authUser, bool) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return nil, false
	}
	if user.Role != "teacher" || user.VerifiedAt == nil {
		writeError(w, http.StatusForbidden, "email_verification_required", "Для этого действия преподаватель должен подтвердить email.")
		return nil, false
	}
	return user, true
}

func nullableString(value string) interface{} {
	if value == "" {
		return nil
	}
	return value
}

func routeID(r *http.Request, name string) (int64, error) {
	value := chi.URLParam(r, name)
	if value == "" {
		return 0, fmt.Errorf("missing route parameter")
	}
	return strconv.ParseInt(value, 10, 64)
}
