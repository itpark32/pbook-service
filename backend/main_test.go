package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestHealth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	res := httptest.NewRecorder()

	router().ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusOK)
	}
	if got := res.Body.String(); got != "{\"status\":\"ok\"}\n" {
		t.Fatalf("body = %q", got)
	}
}

func TestPasswordHash(t *testing.T) {
	hash, err := passwordHash("safe-password")
	if err != nil {
		t.Fatal(err)
	}
	if !verifyPassword(hash, "safe-password") || verifyPassword(hash, "wrong-password") {
		t.Fatal("password verification failed")
	}
}

func TestRateLimit(t *testing.T) {
	auth := &authService{attempts: make(map[string][]time.Time)}
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	for i := 0; i < 10; i++ {
		if !auth.allowAttempt(request, "login") {
			t.Fatal("blocked too early")
		}
	}
	if auth.allowAttempt(request, "login") {
		t.Fatal("rate limit did not block request")
	}
}

func TestClientAddress(t *testing.T) {
	if got := clientAddress("192.0.2.1:54321"); got != "192.0.2.1" {
		t.Fatalf("client address = %q", got)
	}
	if got := clientAddress("invalid"); got != "invalid" {
		t.Fatalf("invalid address = %q", got)
	}
}

func TestCookieSecureDefault(t *testing.T) {
	previous, hadPrevious := os.LookupEnv("COOKIE_SECURE")
	defer func() {
		if hadPrevious {
			_ = os.Setenv("COOKIE_SECURE", previous)
			return
		}
		_ = os.Unsetenv("COOKIE_SECURE")
	}()
	_ = os.Unsetenv("COOKIE_SECURE")
	if !cookieSecureFromEnvironment() {
		t.Fatal("Secure cookies must be enabled by default")
	}
	_ = os.Setenv("COOKIE_SECURE", "false")
	if cookieSecureFromEnvironment() {
		t.Fatal("COOKIE_SECURE=false must support local HTTP development")
	}
}

func TestTokenURL(t *testing.T) {
	auth := &authService{appOrigin: "https://learn.example.test/"}
	if got := auth.tokenURL("/verify-email", "a+b"); got != "https://learn.example.test/verify-email?token=a%2Bb" {
		t.Fatalf("token URL = %q", got)
	}
}
