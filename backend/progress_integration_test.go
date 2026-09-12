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

func TestProgressDatabaseFlow(t *testing.T) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is required for progress integration test")
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = migrate(db); err != nil {
		t.Fatal(err)
	}
	email := fmt.Sprintf("phase14-%d@example.test", time.Now().UnixNano())
	defer func() { _, _ = db.Exec(`DELETE FROM users WHERE email=$1`, email) }()
	hash, err := passwordHash("progress-password")
	if err != nil {
		t.Fatal(err)
	}
	var userID int64
	if err = db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name,email_verified_at) VALUES($1,$2,'student','active','Progress test',now()) RETURNING id`, email, hash).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	auth := &authService{db: db, attempts: make(map[string][]time.Time)}
	router := routerWithAuth(auth)
	res := httptest.NewRecorder()
	if err = auth.startSession(res, userID); err != nil {
		t.Fatal(err)
	}
	var cookie *http.Cookie
	for _, c := range res.Result().Cookies() {
		if c.Name == sessionCookieName {
			cookie = c
		}
	}
	request := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(cookie)
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	if out := request(http.MethodPut, "/api/v1/progress/exercises/ex-1", `{"code":"cloud code","stdin":"3\n","solutionRevealed":true}`); out.Code != http.StatusOK {
		t.Fatalf("save = %d: %s", out.Code, out.Body.String())
	}
	if out := request(http.MethodPost, "/api/v1/progress/exercises/ex-1/attempt", `{"passed":true,"passedTests":3,"totalTests":3,"lessonId":"lesson-1","checkpoint":true}`); out.Code != http.StatusOK {
		t.Fatalf("pass attempt = %d", out.Code)
	}
	if out := request(http.MethodPost, "/api/v1/progress/exercises/ex-1/attempt", `{"passed":false,"passedTests":1,"totalTests":3,"lessonId":"lesson-1","checkpoint":true}`); out.Code != http.StatusOK {
		t.Fatalf("failed attempt = %d", out.Code)
	}
	var completed bool
	var attempts int
	if err = db.QueryRow(`SELECT completed,attempts_count FROM exercise_progress WHERE user_id=$1 AND exercise_id='ex-1'`, userID).Scan(&completed, &attempts); err != nil || !completed || attempts != 2 {
		t.Fatalf("exercise state completed=%v attempts=%d err=%v", completed, attempts, err)
	}
	var status string
	if err = db.QueryRow(`SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id='lesson-1'`, userID).Scan(&status); err != nil || status != "completed" {
		t.Fatalf("lesson completion=%q %v", status, err)
	}
	conflict := request(http.MethodPost, "/api/v1/progress/import", `{"exercises":[{"exerciseId":"ex-1","code":"local code","completed":true}]}`)
	if conflict.Code != http.StatusConflict || !strings.Contains(conflict.Body.String(), "progress_conflict") {
		t.Fatalf("silent conflict handling: %d %s", conflict.Code, conflict.Body.String())
	}
	merged := request(http.MethodPost, "/api/v1/progress/import", `{"exercises":[{"exerciseId":"ex-1","code":"local code","completed":true}],"codeResolutions":{"ex-1":"local"}}`)
	if merged.Code != http.StatusOK {
		t.Fatalf("resolved import = %d: %s", merged.Code, merged.Body.String())
	}
	var code string
	if err = db.QueryRow(`SELECT code FROM exercise_progress WHERE user_id=$1 AND exercise_id='ex-1'`, userID).Scan(&code); err != nil || code != "local code" {
		t.Fatalf("resolved code=%q %v", code, err)
	}
}
