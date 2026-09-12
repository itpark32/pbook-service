package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestInviteDatabaseFlow(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for the PostgreSQL invite integration test")
	}
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = migrate(db); err != nil {
		t.Fatal(err)
	}

	suffix := time.Now().UnixNano()
	adminEmail := fmt.Sprintf("phase12-admin-%d@example.test", suffix)
	studentEmail := fmt.Sprintf("phase12-student-%d@example.test", suffix)
	existingEmail := fmt.Sprintf("phase12-existing-%d@example.test", suffix)
	defer func() {
		_, _ = db.Exec(`DELETE FROM invites WHERE created_by_user_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, adminEmail, studentEmail, existingEmail)
		_, _ = db.Exec(`DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, adminEmail, studentEmail, existingEmail)
		_, _ = db.Exec(`DELETE FROM users WHERE email IN ($1,$2,$3)`, adminEmail, studentEmail, existingEmail)
	}()

	hash, err := passwordHash("invite-password")
	if err != nil {
		t.Fatal(err)
	}
	var adminID int64
	if err = db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,email_verified_at) VALUES($1,$2,'admin','active','Invite admin',now()) RETURNING id`, adminEmail, hash).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	auth := &authService{db: db, appOrigin: "http://127.0.0.1:8088", attempts: make(map[string][]time.Time)}
	previousLogOutput := log.Writer()
	log.SetOutput(io.Discard)
	defer log.SetOutput(previousLogOutput)
	router := routerWithAuth(auth)

	cookieFor := func(userID int64) *http.Cookie {
		response := httptest.NewRecorder()
		if err := auth.startSession(response, userID); err != nil {
			t.Fatal(err)
		}
		for _, cookie := range response.Result().Cookies() {
			if cookie.Name == sessionCookieName {
				return cookie
			}
		}
		t.Fatal("session cookie missing")
		return nil
	}
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		res := httptest.NewRecorder()
		router.ServeHTTP(res, req)
		return res
	}
	urlFrom := func(res *httptest.ResponseRecorder) string {
		var payload struct {
			URL string `json:"url"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &payload); err != nil || payload.URL == "" {
			t.Fatalf("invite URL response = %s", res.Body.String())
		}
		return strings.TrimPrefix(payload.URL, "http://127.0.0.1:8088")
	}
	apiPath := func(invitePath string) string {
		return "/api/v1/invites" + strings.TrimPrefix(invitePath, "/invite")
	}
	registration := func(email, classOrGroup string) string {
		return fmt.Sprintf(`{"email":%q,"password":"invite-password","passwordConfirmation":"invite-password","fullName":"Invite user","birthYear":2010,"city":"Брянск","institutionName":"Лицей","institutionType":"school","classOrGroup":%q}`, email, classOrGroup)
	}

	adminCookie := cookieFor(adminID)
	teacherInvite := request(http.MethodPost, "/api/v1/invites/teacher", "{}", adminCookie)
	if teacherInvite.Code != http.StatusCreated {
		t.Fatalf("teacher invite = %d: %s", teacherInvite.Code, teacherInvite.Body.String())
	}
	teacherPath := urlFrom(teacherInvite)
	teacherAPIPath := apiPath(teacherPath)
	if invitePage := request(http.MethodGet, teacherAPIPath, "", nil); invitePage.Code != http.StatusOK {
		t.Fatalf("teacher invite validation = %d", invitePage.Code)
	}
	registeredTeacher := request(http.MethodPost, teacherAPIPath+"/register", registration(studentEmail, ""), nil)
	if registeredTeacher.Code != http.StatusCreated {
		t.Fatalf("teacher registration = %d: %s", registeredTeacher.Code, registeredTeacher.Body.String())
	}
	var teacherID int64
	if err = db.QueryRow(`SELECT id FROM users WHERE email=$1 AND role='teacher' AND invited_by_user_id=$2`, studentEmail, adminID).Scan(&teacherID); err != nil {
		t.Fatal(err)
	}
	if reused := request(http.MethodPost, teacherAPIPath+"/register", registration("other-"+studentEmail, ""), nil); reused.Code != http.StatusNotFound {
		t.Fatalf("used teacher invite = %d", reused.Code)
	}
	if _, err = db.Exec(`UPDATE users SET email_verified_at=now() WHERE id=$1`, teacherID); err != nil {
		t.Fatal(err)
	}

	teacherCookie := cookieFor(teacherID)
	groupResponse := request(http.MethodPost, "/api/v1/groups", `{"name":"9А"}`, teacherCookie)
	if groupResponse.Code != http.StatusCreated {
		t.Fatalf("minimal group creation = %d: %s", groupResponse.Code, groupResponse.Body.String())
	}
	var groupPayload struct {
		Group struct {
			ID int64 `json:"id"`
		} `json:"group"`
	}
	if err = json.Unmarshal(groupResponse.Body.Bytes(), &groupPayload); err != nil || groupPayload.Group.ID == 0 {
		t.Fatalf("group response = %s", groupResponse.Body.String())
	}
	studentInvite := request(http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/student-invite", groupPayload.Group.ID), "{}", teacherCookie)
	if studentInvite.Code != http.StatusCreated {
		t.Fatalf("student invite = %d: %s", studentInvite.Code, studentInvite.Body.String())
	}
	oldStudentPath := urlFrom(studentInvite)
	regeneratedStudentInvite := request(http.MethodPost, fmt.Sprintf("/api/v1/groups/%d/student-invite", groupPayload.Group.ID), "{}", teacherCookie)
	if regeneratedStudentInvite.Code != http.StatusCreated {
		t.Fatalf("student invite regeneration = %d", regeneratedStudentInvite.Code)
	}
	studentPath := urlFrom(regeneratedStudentInvite)
	oldStudentAPIPath := apiPath(oldStudentPath)
	studentAPIPath := apiPath(studentPath)
	if oldPage := request(http.MethodGet, oldStudentAPIPath, "", nil); oldPage.Code != http.StatusNotFound {
		t.Fatalf("regenerated invite remained valid = %d", oldPage.Code)
	}

	studentRegistration := request(http.MethodPost, studentAPIPath+"/register", registration(existingEmail, "9А"), nil)
	if studentRegistration.Code != http.StatusCreated {
		t.Fatalf("student registration = %d: %s", studentRegistration.Code, studentRegistration.Body.String())
	}
	var registeredStudentID int64
	if err = db.QueryRow(`SELECT id FROM users WHERE email=$1`, existingEmail).Scan(&registeredStudentID); err != nil {
		t.Fatal(err)
	}
	var memberships int
	if err = db.QueryRow(`SELECT count(*) FROM group_memberships WHERE group_id=$1 AND user_id=$2`, groupPayload.Group.ID, registeredStudentID).Scan(&memberships); err != nil || memberships != 1 {
		t.Fatalf("new student membership count = %d, err = %v", memberships, err)
	}

	existingHash, err := passwordHash("existing-password")
	if err != nil {
		t.Fatal(err)
	}
	var existingID int64
	if err = db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,birth_year,city,institution_type,class_or_group) VALUES($1,$2,'student','active','Existing student',2010,'Брянск','school','9Б') RETURNING id`, "join-"+existingEmail, existingHash).Scan(&existingID); err != nil {
		t.Fatal(err)
	}
	defer func() { _, _ = db.Exec(`DELETE FROM users WHERE id=$1`, existingID) }()
	if joined := request(http.MethodPost, studentAPIPath+"/join", "{}", cookieFor(existingID)); joined.Code != http.StatusOK {
		t.Fatalf("existing student join = %d: %s", joined.Code, joined.Body.String())
	}
	if err = db.QueryRow(`SELECT count(*) FROM group_memberships WHERE group_id=$1 AND user_id=$2`, groupPayload.Group.ID, existingID).Scan(&memberships); err != nil || memberships != 1 {
		t.Fatalf("existing student membership count = %d, err = %v", memberships, err)
	}

	promotionInvite := request(http.MethodPost, "/api/v1/invites/teacher", "{}", adminCookie)
	promotionPath := urlFrom(promotionInvite)
	if promoted := request(http.MethodPost, apiPath(promotionPath)+"/join", "{}", cookieFor(existingID)); promoted.Code != http.StatusOK {
		t.Fatalf("existing student teacher promotion = %d: %s", promoted.Code, promoted.Body.String())
	}
	var role string
	if err = db.QueryRow(`SELECT role FROM users WHERE id=$1`, existingID).Scan(&role); err != nil || role != "teacher" {
		t.Fatalf("promoted role = %q, err = %v", role, err)
	}

	revokedInvite := request(http.MethodPost, "/api/v1/invites/teacher", "{}", adminCookie)
	revokedPath := urlFrom(revokedInvite)
	revokedAPIPath := apiPath(revokedPath)
	if revoked := request(http.MethodPost, revokedAPIPath+"/revoke", "{}", adminCookie); revoked.Code != http.StatusOK {
		t.Fatalf("revoke = %d: %s", revoked.Code, revoked.Body.String())
	}
	if revokedPage := request(http.MethodGet, revokedAPIPath, "", nil); revokedPage.Code != http.StatusNotFound {
		t.Fatalf("revoked invite remained valid = %d", revokedPage.Code)
	}
}
