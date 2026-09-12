package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"database/sql"
)

// Run with DATABASE_URL set against an isolated local test database. The test
// creates one address with a timestamp suffix and removes it, including its
// cascaded sessions and tokens, before returning.
func TestAuthDatabaseFlow(t *testing.T) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		t.Skip("DATABASE_URL is required for the PostgreSQL auth integration test")
	}

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		t.Fatal(err)
	}
	if err = migrate(db); err != nil {
		t.Fatal(err)
	}

	email := fmt.Sprintf("phase11-auth-%d@example.test", time.Now().UnixNano())
	defer func() {
		_, _ = db.Exec(`DELETE FROM users WHERE email=$1`, email)
	}()
	hash, err := passwordHash("initial-password")
	if err != nil {
		t.Fatal(err)
	}
	var userID int64
	if err = db.QueryRow(`INSERT INTO users(email,password_hash,role,status,full_name) VALUES($1,$2,'student','active','Integration test') RETURNING id`, email, hash).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO users(email,password_hash,role,status) VALUES($1,$2,'student','active')`, strings.ToUpper(email), hash); err == nil {
		t.Fatal("case-insensitive email unique index allowed a duplicate")
	}

	auth := &authService{db: db, appOrigin: "http://127.0.0.1:8088", attempts: make(map[string][]time.Time)}
	previousLogOutput := log.Writer()
	log.SetOutput(io.Discard)
	defer log.SetOutput(previousLogOutput)

	login := func(password string) *http.Cookie {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"email":"`+email+`","password":"`+password+`"}`))
		req.Header.Set("Content-Type", "application/json")
		res := httptest.NewRecorder()
		auth.login(res, req)
		if res.Code != http.StatusOK {
			t.Fatalf("login status = %d, body = %s", res.Code, res.Body.String())
		}
		for _, cookie := range res.Result().Cookies() {
			if cookie.Name == sessionCookieName {
				return cookie
			}
		}
		t.Fatal("login did not set a session cookie")
		return nil
	}
	me := func(cookie *http.Cookie) int {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
		req.AddCookie(cookie)
		res := httptest.NewRecorder()
		auth.me(res, req)
		return res.Code
	}

	cookie := login("initial-password")
	if status := me(cookie); status != http.StatusOK {
		t.Fatalf("authenticated /me = %d", status)
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	logoutRequest.AddCookie(cookie)
	logoutResponse := httptest.NewRecorder()
	auth.logout(logoutResponse, logoutRequest)
	if logoutResponse.Code != http.StatusOK || me(cookie) != http.StatusUnauthorized {
		t.Fatal("logout did not revoke the current session")
	}

	if _, err = db.Exec(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()-interval '1 second')`, userID, tokenHash("expired-integration-token")); err != nil {
		t.Fatal(err)
	}
	if status := me(&http.Cookie{Name: sessionCookieName, Value: "expired-integration-token"}); status != http.StatusUnauthorized {
		t.Fatalf("expired session /me = %d", status)
	}

	cookie = login("initial-password")
	resendRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/resend-verification", nil)
	resendRequest.AddCookie(cookie)
	resendResponse := httptest.NewRecorder()
	auth.resendVerification(resendResponse, resendRequest)
	if resendResponse.Code != http.StatusOK {
		t.Fatalf("first verification resend = %d", resendResponse.Code)
	}
	secondResend := httptest.NewRecorder()
	auth.resendVerification(secondResend, resendRequest)
	if secondResend.Code != http.StatusTooManyRequests {
		t.Fatalf("verification resend cooldown = %d", secondResend.Code)
	}

	verificationToken, err := auth.issueToken(userID, "verify_email", 24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	verificationRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-email", strings.NewReader(`{"token":"`+verificationToken+`"}`))
	verificationRequest.Header.Set("Content-Type", "application/json")
	verificationResponse := httptest.NewRecorder()
	auth.verifyEmail(verificationResponse, verificationRequest)
	if verificationResponse.Code != http.StatusOK {
		t.Fatalf("email verification = %d", verificationResponse.Code)
	}

	resetToken, err := auth.issueToken(userID, "reset_password", 30*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	resetRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/reset-password", strings.NewReader(`{"token":"`+resetToken+`","password":"renewed-password"}`))
	resetRequest.Header.Set("Content-Type", "application/json")
	resetResponse := httptest.NewRecorder()
	auth.resetPassword(resetResponse, resetRequest)
	if resetResponse.Code != http.StatusOK || me(cookie) != http.StatusUnauthorized {
		t.Fatal("password reset did not revoke every session")
	}
	if newCookie := login("renewed-password"); me(newCookie) != http.StatusOK {
		t.Fatal("new password did not authenticate")
	}
}
