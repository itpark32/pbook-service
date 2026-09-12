package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestGroupDatabaseFlow(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for the PostgreSQL group integration test")
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
	teacherAEmail := fmt.Sprintf("phase13-teacher-a-%d@example.test", suffix)
	teacherBEmail := fmt.Sprintf("phase13-teacher-b-%d@example.test", suffix)
	studentEmail := fmt.Sprintf("phase13-student-%d@example.test", suffix)
	defer func() {
		_, _ = db.Exec(`DELETE FROM invites WHERE created_by_user_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, teacherAEmail, teacherBEmail, studentEmail)
		_, _ = db.Exec(`DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email IN ($1,$2,$3))`, teacherAEmail, teacherBEmail, studentEmail)
		_, _ = db.Exec(`DELETE FROM users WHERE email IN ($1,$2,$3)`, teacherAEmail, teacherBEmail, studentEmail)
	}()

	hash, err := passwordHash("group-password")
	if err != nil {
		t.Fatal(err)
	}
	createUser := func(email, role string) int64 {
		var id int64
		if err := db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,birth_year,city,institution_type,class_or_group,email_verified_at) VALUES($1,$2,$3,'active',$4,2010,'Брянск','school','9А',now()) RETURNING id`, email, hash, role, role+" test").Scan(&id); err != nil {
			t.Fatal(err)
		}
		return id
	}
	teacherAID := createUser(teacherAEmail, "teacher")
	teacherBID := createUser(teacherBEmail, "teacher")
	studentID := createUser(studentEmail, "student")
	auth := &authService{db: db, appOrigin: "http://127.0.0.1:8088", attempts: make(map[string][]time.Time)}
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
		req.AddCookie(cookie)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}

	teacherACookie := cookieFor(teacherAID)
	createA := request(http.MethodPost, "/api/v1/groups", `{"name":"Python 9А"}`, teacherACookie)
	if createA.Code != http.StatusCreated {
		t.Fatalf("create group = %d: %s", createA.Code, createA.Body.String())
	}
	var created struct {
		Group struct {
			ID int64 `json:"id"`
		} `json:"group"`
	}
	if err = json.Unmarshal(createA.Body.Bytes(), &created); err != nil || created.Group.ID == 0 {
		t.Fatalf("group response = %s", createA.Body.String())
	}
	groupAID := created.Group.ID
	var groupBID int64
	if err = db.QueryRow(`INSERT INTO groups(teacher_id,name) VALUES($1,'Чужая группа') RETURNING id`, teacherBID).Scan(&groupBID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2)`, groupAID, studentID); err != nil {
		t.Fatal(err)
	}

	list := request(http.MethodGet, "/api/v1/groups", "", teacherACookie)
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), studentEmail) {
		t.Fatalf("own group list = %d: %s", list.Code, list.Body.String())
	}
	if denied := request(http.MethodPatch, fmt.Sprintf("/api/v1/groups/%d", groupBID), `{"name":"Попытка"}`, teacherACookie); denied.Code != http.StatusForbidden {
		t.Fatalf("foreign rename = %d", denied.Code)
	}
	if renamed := request(http.MethodPatch, fmt.Sprintf("/api/v1/groups/%d", groupAID), `{"name":"Алгоритмы 9А"}`, teacherACookie); renamed.Code != http.StatusOK {
		t.Fatalf("rename own group = %d: %s", renamed.Code, renamed.Body.String())
	}
	if removed := request(http.MethodDelete, fmt.Sprintf("/api/v1/groups/%d/members/%d", groupAID, studentID), "", teacherACookie); removed.Code != http.StatusOK {
		t.Fatalf("remove student = %d: %s", removed.Code, removed.Body.String())
	}
	var count int
	if err = db.QueryRow(`SELECT count(*) FROM group_memberships WHERE group_id=$1 AND user_id=$2`, groupAID, studentID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("membership remained after removal: %d, %v", count, err)
	}
	if err = db.QueryRow(`SELECT count(*) FROM users WHERE id=$1`, studentID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("student was deleted with membership: %d, %v", count, err)
	}
	if _, err = db.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2)`, groupAID, studentID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO invites(type,token_hash,created_by_user_id,group_id) VALUES('student',$1,$2,$3)`, tokenHash("phase13-delete-token"), teacherAID, groupAID); err != nil {
		t.Fatal(err)
	}
	if denied := request(http.MethodDelete, fmt.Sprintf("/api/v1/groups/%d", groupBID), "", teacherACookie); denied.Code != http.StatusForbidden {
		t.Fatalf("foreign delete = %d", denied.Code)
	}
	if deleted := request(http.MethodDelete, fmt.Sprintf("/api/v1/groups/%d", groupAID), "", teacherACookie); deleted.Code != http.StatusOK {
		t.Fatalf("delete own group = %d: %s", deleted.Code, deleted.Body.String())
	}
	if err = db.QueryRow(`SELECT count(*) FROM groups WHERE id=$1`, groupAID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("group remained after deletion: %d, %v", count, err)
	}
	if err = db.QueryRow(`SELECT count(*) FROM invites WHERE token_hash=$1`, tokenHash("phase13-delete-token")).Scan(&count); err != nil || count != 0 {
		t.Fatalf("student invite remained after group deletion: %d, %v", count, err)
	}
	if denied := request(http.MethodGet, "/api/v1/groups", "", cookieFor(studentID)); denied.Code != http.StatusForbidden {
		t.Fatalf("student group list = %d", denied.Code)
	}
}
