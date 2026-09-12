package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

type adminUserRecord struct {
	ID              int64      `json:"id"`
	Email           string     `json:"email"`
	FullName        *string    `json:"fullName,omitempty"`
	Role            string     `json:"role"`
	Status          string     `json:"status"`
	BirthYear       *int       `json:"birthYear,omitempty"`
	City            *string    `json:"city,omitempty"`
	InstitutionName *string    `json:"institutionName,omitempty"`
	InstitutionType *string    `json:"institutionType,omitempty"`
	ClassOrGroup    *string    `json:"classOrGroup,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	LastLoginAt     *time.Time `json:"lastLoginAt,omitempty"`
	InvitedByUserID *int64     `json:"invitedByUserId,omitempty"`
}

type adminInviteRecord struct {
	ID           int64      `json:"id"`
	Type         string     `json:"type"`
	CreatorName  *string    `json:"creatorName,omitempty"`
	CreatorEmail string     `json:"creatorEmail"`
	GroupName    *string    `json:"groupName,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	ExpiresAt    *time.Time `json:"expiresAt,omitempty"`
	UsedAt       *time.Time `json:"usedAt,omitempty"`
	RevokedAt    *time.Time `json:"revokedAt,omitempty"`
}

type adminTeacherNode struct {
	ID       int64               `json:"id"`
	FullName *string             `json:"fullName,omitempty"`
	Email    string              `json:"email"`
	Role     string              `json:"role"`
	Status   string              `json:"status"`
	Children []*adminTeacherNode `json:"children"`
}

func (s *authService) adminUser(w http.ResponseWriter, r *http.Request) (*authUser, bool) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return nil, false
	}
	if user.Role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Раздел доступен только администратору.")
		return nil, false
	}
	return user, true
}

func (s *authService) adminUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminUser(w, r); !ok {
		return
	}
	query := strings.TrimSpace(r.URL.Query().Get("query"))
	role := r.URL.Query().Get("role")
	status := r.URL.Query().Get("status")
	city := strings.TrimSpace(r.URL.Query().Get("city"))
	institutionType := r.URL.Query().Get("institutionType")
	institutionName := strings.TrimSpace(r.URL.Query().Get("institutionName"))
	birthYear := strings.TrimSpace(r.URL.Query().Get("birthYear"))
	if role != "" && role != "student" && role != "teacher" && role != "admin" {
		writeError(w, http.StatusBadRequest, "invalid_filter", "Некорректная роль.")
		return
	}
	if status != "" && status != "active" && status != "blocked" {
		writeError(w, http.StatusBadRequest, "invalid_filter", "Некорректный статус.")
		return
	}
	if institutionType != "" && !institutionTypes[institutionType] {
		writeError(w, http.StatusBadRequest, "invalid_filter", "Некорректный тип организации.")
		return
	}
	arguments := []interface{}{}
	conditions := []string{"true"}
	add := func(condition string, value interface{}) {
		arguments = append(arguments, value)
		conditions = append(conditions, condition+"$"+strconv.Itoa(len(arguments)))
	}
	if query != "" {
		add("(coalesce(u.full_name,'') ILIKE ", "%"+query+"%")
		conditions[len(conditions)-1] += " OR u.email ILIKE $" + strconv.Itoa(len(arguments)) + ")"
	}
	if role != "" {
		add("u.role=", role)
	}
	if status != "" {
		add("u.status=", status)
	}
	if city != "" {
		add("coalesce(u.city,'') ILIKE ", "%"+city+"%")
	}
	if institutionType != "" {
		add("u.institution_type=", institutionType)
	}
	if institutionName != "" {
		add("coalesce(u.institution_name,'') ILIKE ", "%"+institutionName+"%")
	}
	if birthYear != "" {
		year, err := strconv.Atoi(birthYear)
		if err != nil || year < 1900 || year > time.Now().Year() {
			writeError(w, http.StatusBadRequest, "invalid_filter", "Некорректный год рождения.")
			return
		}
		add("u.birth_year=", year)
	}
	rows, err := s.db.Query(`SELECT u.id,u.email,u.full_name,u.role,u.status,u.birth_year,u.city,u.institution_name,u.institution_type,u.class_or_group,u.created_at,u.last_login_at,u.invited_by_user_id
		FROM users u WHERE `+strings.Join(conditions, " AND ")+` ORDER BY u.created_at DESC,u.id DESC LIMIT 300`, arguments...)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	users := make([]adminUserRecord, 0)
	for rows.Next() {
		var user adminUserRecord
		if err = rows.Scan(&user.ID, &user.Email, &user.FullName, &user.Role, &user.Status, &user.BirthYear, &user.City, &user.InstitutionName, &user.InstitutionType, &user.ClassOrGroup, &user.CreatedAt, &user.LastLoginAt, &user.InvitedByUserID); err != nil {
			serverError(w, err)
			return
		}
		users = append(users, user)
	}
	if err = rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"users": users})
}

func (s *authService) adminChangeUserStatus(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.adminUser(w, r)
	if !ok {
		return
	}
	userID, err := routeID(r, "userID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_user", "Некорректный пользователь.")
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if input.Status != "active" && input.Status != "blocked" {
		writeError(w, http.StatusBadRequest, "invalid_status", "Некорректный статус.")
		return
	}
	if userID == admin.ID && input.Status == "blocked" {
		writeError(w, http.StatusConflict, "cannot_block_self", "Нельзя заблокировать текущий аккаунт администратора.")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var exists bool
	if err = tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)`, userID).Scan(&exists); err != nil {
		serverError(w, err)
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "user_not_found", "Пользователь не найден.")
		return
	}
	if _, err = tx.Exec(`UPDATE users SET status=$1,updated_at=now() WHERE id=$2`, input.Status, userID); err != nil {
		serverError(w, err)
		return
	}
	if input.Status == "blocked" {
		if _, err = tx.Exec(`DELETE FROM sessions WHERE user_id=$1`, userID); err != nil {
			serverError(w, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true, "status": input.Status})
}

func (s *authService) adminInvites(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminUser(w, r); !ok {
		return
	}
	rows, err := s.db.Query(`SELECT i.id,i.type,creator.full_name,creator.email,g.name,i.created_at,i.expires_at,i.used_at,i.revoked_at
		FROM invites i JOIN users creator ON creator.id=i.created_by_user_id LEFT JOIN groups g ON g.id=i.group_id
		ORDER BY i.created_at DESC,i.id DESC LIMIT 300`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	invites := make([]adminInviteRecord, 0)
	for rows.Next() {
		var invite adminInviteRecord
		if err = rows.Scan(&invite.ID, &invite.Type, &invite.CreatorName, &invite.CreatorEmail, &invite.GroupName, &invite.CreatedAt, &invite.ExpiresAt, &invite.UsedAt, &invite.RevokedAt); err != nil {
			serverError(w, err)
			return
		}
		invites = append(invites, invite)
	}
	if err = rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"invites": invites})
}

func (s *authService) adminRevokeInvite(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminUser(w, r); !ok {
		return
	}
	inviteID, err := routeID(r, "inviteID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_invite", "Некорректное приглашение.")
		return
	}
	result, err := s.db.Exec(`UPDATE invites SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1`, inviteID)
	if err != nil {
		serverError(w, err)
		return
	}
	changed, err := result.RowsAffected()
	if err != nil {
		serverError(w, err)
		return
	}
	if changed == 0 {
		writeError(w, http.StatusNotFound, "invite_not_found", "Приглашение не найдено.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) adminTeacherTree(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.adminUser(w, r); !ok {
		return
	}
	rows, err := s.db.Query(`SELECT id,full_name,email,role,status,invited_by_user_id FROM users WHERE role IN ('admin','teacher') ORDER BY created_at,id`)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	type treeRow struct {
		node     *adminTeacherNode
		parentID *int64
	}
	items := make([]treeRow, 0)
	nodes := map[int64]*adminTeacherNode{}
	for rows.Next() {
		node := &adminTeacherNode{Children: make([]*adminTeacherNode, 0)}
		var parentID *int64
		if err = rows.Scan(&node.ID, &node.FullName, &node.Email, &node.Role, &node.Status, &parentID); err != nil {
			serverError(w, err)
			return
		}
		nodes[node.ID] = node
		items = append(items, treeRow{node: node, parentID: parentID})
	}
	if err = rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	roots := make([]*adminTeacherNode, 0)
	for _, item := range items {
		if item.parentID != nil && nodes[*item.parentID] != nil {
			nodes[*item.parentID].Children = append(nodes[*item.parentID].Children, item.node)
		} else {
			roots = append(roots, item.node)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"tree": roots})
}
