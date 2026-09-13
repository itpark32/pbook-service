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

func TestTeacherCabinetOnlyShowsOwnStudents(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for the PostgreSQL teacher cabinet integration test")
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
	teacherAEmail := fmt.Sprintf("phase15-teacher-a-%d@example.test", suffix)
	teacherBEmail := fmt.Sprintf("phase15-teacher-b-%d@example.test", suffix)
	studentAEmail := fmt.Sprintf("phase15-student-a-%d@example.test", suffix)
	studentBEmail := fmt.Sprintf("phase15-student-b-%d@example.test", suffix)
	defer func() {
		_, _ = db.Exec(`DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email IN ($1,$2))`, teacherAEmail, teacherBEmail)
		_, _ = db.Exec(`DELETE FROM users WHERE email IN ($1,$2,$3,$4)`, teacherAEmail, teacherBEmail, studentAEmail, studentBEmail)
	}()

	hash, err := passwordHash("teacher-cabinet-password")
	if err != nil {
		t.Fatal(err)
	}
	createUser := func(email, role, name string) int64 {
		var id int64
		err := db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,birth_year,city,institution_name,institution_type,class_or_group,email_verified_at) VALUES($1,$2,$3,'active',$4,2011,'Брянск','Гимназия №1','school','9А',now()) RETURNING id`, email, hash, role, name).Scan(&id)
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	teacherAID := createUser(teacherAEmail, "teacher", "Преподаватель А")
	teacherBID := createUser(teacherBEmail, "teacher", "Преподаватель Б")
	studentAID := createUser(studentAEmail, "student", "Ученик А")
	studentBID := createUser(studentBEmail, "student", "Ученик Б")
	var groupAID, groupBID int64
	if err = db.QueryRow(`INSERT INTO groups(teacher_id,name) VALUES($1,'Python 9А') RETURNING id`, teacherAID).Scan(&groupAID); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`INSERT INTO groups(teacher_id,name) VALUES($1,'Чужая группа') RETURNING id`, teacherBID).Scan(&groupBID); err != nil {
		t.Fatal(err)
	}
	for _, membership := range [][2]int64{{groupAID, studentAID}, {groupBID, studentBID}} {
		if _, err = db.Exec(`INSERT INTO group_memberships(group_id,user_id) VALUES($1,$2)`, membership[0], membership[1]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = db.Exec(`INSERT INTO lesson_progress(user_id,lesson_id,status,completed_at) VALUES($1,'python-branches-if-else','completed',now())`, studentAID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO exercise_progress(user_id,exercise_id,completed,attempts_count,passed_tests,total_tests,code,stdin) VALUES($1,'python-branches-if-else-sign',true,2,3,3,$2,'7')`, studentAID, "print('готово')"); err != nil {
		t.Fatal(err)
	}

	auth := &authService{db: db, attempts: make(map[string][]time.Time)}
	router := routerWithAuth(auth)
	response := httptest.NewRecorder()
	if err = auth.startSession(response, teacherAID); err != nil {
		t.Fatal(err)
	}
	var cookie *http.Cookie
	for _, candidate := range response.Result().Cookies() {
		if candidate.Name == sessionCookieName {
			cookie = candidate
		}
	}
	if cookie == nil {
		t.Fatal("session cookie missing")
	}
	request := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.AddCookie(cookie)
		result := httptest.NewRecorder()
		router.ServeHTTP(result, req)
		return result
	}

	students := request(fmt.Sprintf("/api/v1/teacher/groups/%d/students", groupAID))
	if students.Code != http.StatusOK || !strings.Contains(students.Body.String(), studentAEmail) || !strings.Contains(students.Body.String(), `"completedLessons":1`) {
		t.Fatalf("own group students = %d: %s", students.Code, students.Body.String())
	}
	if strings.Contains(students.Body.String(), studentBEmail) {
		t.Fatalf("foreign student leaked: %s", students.Body.String())
	}
	card := request(fmt.Sprintf("/api/v1/teacher/students/%d", studentAID))
	if card.Code != http.StatusOK || !strings.Contains(card.Body.String(), "Гимназия №1") || !strings.Contains(card.Body.String(), `"totalLessons":49`) || !strings.Contains(card.Body.String(), `"totalExercises":239`) {
		t.Fatalf("own student card = %d: %s", card.Code, card.Body.String())
	}
	code := request(fmt.Sprintf("/api/v1/teacher/students/%d/exercises/python-branches-if-else-sign", studentAID))
	if code.Code != http.StatusOK || !strings.Contains(code.Body.String(), "print('готово')") {
		t.Fatalf("own student code = %d: %s", code.Code, code.Body.String())
	}
	if denied := request(fmt.Sprintf("/api/v1/teacher/students/%d", studentBID)); denied.Code != http.StatusForbidden {
		t.Fatalf("foreign student card = %d: %s", denied.Code, denied.Body.String())
	}
	if denied := request(fmt.Sprintf("/api/v1/teacher/groups/%d/students", groupBID)); denied.Code != http.StatusForbidden {
		t.Fatalf("foreign group students = %d: %s", denied.Code, denied.Body.String())
	}
}
