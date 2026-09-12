package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestAdminPanelBlocksSessionsAndDisablesInvites(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for the PostgreSQL admin integration test")
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
	adminEmail := fmt.Sprintf("phase16-admin-%d@example.test", suffix)
	teacherEmail := fmt.Sprintf("phase16-teacher-%d@example.test", suffix)
	studentEmail := fmt.Sprintf("phase16-student-%d@example.test", suffix)
	defer func() {
		_, _ = db.Exec(`DELETE FROM invites WHERE created_by_user_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, adminEmail, teacherEmail, studentEmail)
		_, _ = db.Exec(`DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, adminEmail, teacherEmail, studentEmail)
		_, _ = db.Exec(`DELETE FROM users WHERE email IN ($1,$2,$3)`, adminEmail, teacherEmail, studentEmail)
	}()
	hash, err := passwordHash("admin-panel-password")
	if err != nil {
		t.Fatal(err)
	}
	createUser := func(email, role string, invitedBy interface{}) int64 {
		var id int64
		if err := db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,birth_year,city,institution_name,institution_type,class_or_group,invited_by_user_id,email_verified_at) VALUES($1,$2,$3,'active',$4,2010,'Брянск','Гимназия №1','school','9А',$5,now()) RETURNING id`, email, hash, role, role+" Phase 16", invitedBy).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	adminID := createUser(adminEmail, "admin", nil)
	teacherID := createUser(teacherEmail, "teacher", adminID)
	studentID := createUser(studentEmail, "student", nil)
	var groupID int64
	if err = db.QueryRow(`INSERT INTO groups(teacher_id,name) VALUES($1,'Phase 16 группа') RETURNING id`, teacherID).Scan(&groupID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2)`, groupID, studentID); err != nil {
		t.Fatal(err)
	}
	teacherToken := "phase16-teacher-token-" + fmt.Sprint(suffix)
	studentToken := "phase16-student-token-" + fmt.Sprint(suffix)
	var teacherInviteID int64
	if err = db.QueryRow(`INSERT INTO invites(type,token_hash,created_by_user_id,expires_at) VALUES('teacher',$1,$2,now()+interval '7 days') RETURNING id`, tokenHash(teacherToken), teacherID).Scan(&teacherInviteID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO invites(type,token_hash,created_by_user_id,group_id) VALUES('student',$1,$2,$3)`, tokenHash(studentToken), teacherID, groupID); err != nil {
		t.Fatal(err)
	}

	auth := &authService{db: db, attempts: make(map[string][]time.Time)}
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
	adminCookie := cookieFor(adminID)
	teacherCookie := cookieFor(teacherID)
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		req.AddCookie(cookie)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}

	users := request(http.MethodGet, "/api/v1/admin/users?query="+teacherEmail+"&role=teacher&city=%D0%91%D1%80%D1%8F%D0%BD%D1%81%D0%BA&birthYear=2010", "", adminCookie)
	if users.Code != http.StatusOK || !strings.Contains(users.Body.String(), teacherEmail) {
		t.Fatalf("admin users = %d: %s", users.Code, users.Body.String())
	}
	if denied := request(http.MethodGet, "/api/v1/admin/users", "", teacherCookie); denied.Code != http.StatusForbidden {
		t.Fatalf("non-admin users = %d", denied.Code)
	}
	tree := request(http.MethodGet, "/api/v1/admin/teacher-tree", "", adminCookie)
	if tree.Code != http.StatusOK || !strings.Contains(tree.Body.String(), teacherEmail) || !strings.Contains(tree.Body.String(), adminEmail) {
		t.Fatalf("teacher tree = %d: %s", tree.Code, tree.Body.String())
	}
	block := request(http.MethodPatch, fmt.Sprintf("/api/v1/admin/users/%d/status", teacherID), `{"status":"blocked"}`, adminCookie)
	if block.Code != http.StatusOK {
		t.Fatalf("block = %d: %s", block.Code, block.Body.String())
	}
	var status string
	if err = db.QueryRow(`SELECT status FROM users WHERE id=$1`, teacherID).Scan(&status); err != nil || status != "blocked" {
		t.Fatalf("teacher status = %q, %v", status, err)
	}
	var sessions int
	if err = db.QueryRow(`SELECT count(*) FROM sessions WHERE user_id=$1`, teacherID).Scan(&sessions); err != nil || sessions != 0 {
		t.Fatalf("teacher sessions = %d, %v", sessions, err)
	}
	if disabled := request(http.MethodGet, "/api/v1/invites/"+teacherToken, "", adminCookie); disabled.Code != http.StatusNotFound {
		t.Fatalf("blocked teacher invite = %d", disabled.Code)
	}
	if disabled := request(http.MethodGet, "/api/v1/invites/"+studentToken, "", adminCookie); disabled.Code != http.StatusNotFound {
		t.Fatalf("blocked group invite = %d", disabled.Code)
	}
	if denied := request(http.MethodGet, "/api/v1/groups", "", teacherCookie); denied.Code != http.StatusUnauthorized {
		t.Fatalf("blocked teacher group access = %d", denied.Code)
	}
	if groups := request(http.MethodGet, "/api/v1/groups", "", adminCookie); groups.Code != http.StatusForbidden {
		t.Fatalf("admin is not teacher = %d", groups.Code)
	}
	if err = db.QueryRow(`SELECT count(*) FROM groups WHERE id=$1`, groupID).Scan(&sessions); err != nil || sessions != 1 {
		t.Fatalf("group lost after block = %d, %v", sessions, err)
	}
	if revoke := request(http.MethodPost, fmt.Sprintf("/api/v1/admin/invites/%d/revoke", teacherInviteID), `{}`, adminCookie); revoke.Code != http.StatusOK {
		t.Fatalf("admin revoke = %d: %s", revoke.Code, revoke.Body.String())
	}
	if unblock := request(http.MethodPatch, fmt.Sprintf("/api/v1/admin/users/%d/status", teacherID), `{"status":"active"}`, adminCookie); unblock.Code != http.StatusOK {
		t.Fatalf("unblock = %d: %s", unblock.Code, unblock.Body.String())
	}
}
