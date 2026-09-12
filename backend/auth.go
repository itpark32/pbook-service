package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"
)

const sessionCookieName = "pbook_session"

type authService struct {
	db           *sql.DB
	cookieSecure bool
	appOrigin    string
	mu           sync.Mutex
	attempts     map[string][]time.Time
}

func (s *authService) allowAttempt(r *http.Request, action string) bool {
	key := action + ":" + clientAddress(r.RemoteAddr)
	now := time.Now()
	s.mu.Lock()
	defer s.mu.Unlock()
	kept := s.attempts[key][:0]
	for _, when := range s.attempts[key] {
		if now.Sub(when) < time.Minute {
			kept = append(kept, when)
		}
	}
	if len(kept) >= 10 {
		s.attempts[key] = kept
		return false
	}
	s.attempts[key] = append(kept, now)
	return true
}

func clientAddress(remoteAddress string) string {
	host, _, err := net.SplitHostPort(remoteAddress)
	if err == nil {
		return host
	}
	return remoteAddress
}

func (s *authService) protect(action string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" && s.appOrigin != "" && origin != s.appOrigin {
			writeError(w, http.StatusForbidden, "invalid_origin", "Запрос отклонён.")
			return
		}
		if !s.allowAttempt(r, action) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", "Слишком много попыток. Попробуйте позже.")
			return
		}
		next(w, r)
	}
}

type authUser struct {
	ID         int64      `json:"id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	Status     string     `json:"status"`
	FullName   *string    `json:"fullName,omitempty"`
	VerifiedAt *time.Time `json:"emailVerifiedAt,omitempty"`
}

func normalizeEmail(value string) string { return strings.ToLower(strings.TrimSpace(value)) }

func randomToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func passwordHash(password string) (string, error) {
	if len(password) < 8 || len(password) > 128 {
		return "", errors.New("пароль должен содержать от 8 до 128 символов")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, 3, 64*1024, 2, 32)
	return fmt.Sprintf("$argon2id$v=19$m=65536,t=3,p=2$%s$%s", base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

func verifyPassword(encoded, password string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var memory uint32
	var iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false
	}
	salt, saltErr := base64.RawStdEncoding.DecodeString(parts[4])
	key, keyErr := base64.RawStdEncoding.DecodeString(parts[5])
	if saltErr != nil || keyErr != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(key)))
	return subtleEqual(actual, key)
}

func subtleEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	value := byte(0)
	for i := range a {
		value |= a[i] ^ b[i]
	}
	return value == 0
}

func (s *authService) sessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{Name: sessionCookieName, Value: token, Path: "/", HttpOnly: true, Secure: s.cookieSecure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: int(time.Until(expires).Seconds())}
}

func (s *authService) currentUser(r *http.Request) (*authUser, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return nil, err
	}
	row := s.db.QueryRow(`SELECT u.id,u.email,u.role,u.status,u.full_name,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, tokenHash(cookie.Value))
	var user authUser
	if err := row.Scan(&user.ID, &user.Email, &user.Role, &user.Status, &user.FullName, &user.VerifiedAt); err != nil {
		return nil, err
	}
	if user.Status != "active" {
		return nil, sql.ErrNoRows
	}
	return &user, nil
}

func (s *authService) login(w http.ResponseWriter, r *http.Request) {
	var input struct{ Email, Password string }
	if !decodeJSON(w, r, &input) {
		return
	}
	var id int64
	var hash, status string
	err := s.db.QueryRow(`SELECT id,password_hash,status FROM users WHERE lower(email)=lower($1)`, normalizeEmail(input.Email)).Scan(&id, &hash, &status)
	if err != nil || status != "active" || !verifyPassword(hash, input.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "Неверный email или пароль.")
		return
	}
	if err = s.startSession(w, id); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) startSession(w http.ResponseWriter, userID int64) error {
	token, err := randomToken()
	if err != nil {
		return err
	}
	expires := time.Now().Add(30 * 24 * time.Hour)
	if _, err = s.db.Exec(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)`, userID, tokenHash(token), expires); err != nil {
		return err
	}
	_, _ = s.db.Exec(`UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1`, userID)
	http.SetCookie(w, s.sessionCookie(token, expires))
	return nil
}

func (s *authService) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token_hash=$1`, tokenHash(cookie.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, Secure: s.cookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) me(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]*authUser{"user": user})
}

func (s *authService) issueToken(userID int64, kind string, ttl time.Duration) (string, error) {
	_, err := s.db.Exec(`UPDATE auth_tokens SET used_at=now() WHERE user_id=$1 AND type=$2 AND used_at IS NULL`, userID, kind)
	if err != nil {
		return "", err
	}
	token, err := randomToken()
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO auth_tokens(user_id,type,token_hash,expires_at) VALUES($1,$2,$3,$4)`, userID, kind, tokenHash(token), time.Now().Add(ttl))
	return token, err
}

func (s *authService) tokenURL(path, token string) string {
	base := strings.TrimRight(s.appOrigin, "/")
	return base + path + "?token=" + url.QueryEscape(token)
}

func (s *authService) verifyEmail(w http.ResponseWriter, r *http.Request) {
	var input struct{ Token string }
	if !decodeJSON(w, r, &input) {
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var userID int64
	err = tx.QueryRow(`UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND type='verify_email' AND used_at IS NULL AND expires_at>now() RETURNING user_id`, tokenHash(input.Token)).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_token", "Ссылка недействительна или устарела.")
		return
	}
	if _, err = tx.Exec(`UPDATE users SET email_verified_at=coalesce(email_verified_at,now()),updated_at=now() WHERE id=$1`, userID); err != nil {
		serverError(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) resendVerification(w http.ResponseWriter, r *http.Request) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return
	}
	if user.VerifiedAt != nil {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	var lastSent time.Time
	err = s.db.QueryRow(`SELECT created_at FROM auth_tokens WHERE user_id=$1 AND type='verify_email' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`, user.ID).Scan(&lastSent)
	if err == nil && time.Since(lastSent) < time.Minute {
		writeError(w, http.StatusTooManyRequests, "resend_cooldown", "Письмо уже отправлено. Попробуйте через минуту.")
		return
	}
	if err != nil && err != sql.ErrNoRows {
		serverError(w, err)
		return
	}
	token, err := s.issueToken(user.ID, "verify_email", 24*time.Hour)
	if err != nil {
		serverError(w, err)
		return
	}
	log.Printf("DEV verification link for %s: %s", user.Email, s.tokenURL("/verify-email", token))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var input struct{ Email string }
	if !decodeJSON(w, r, &input) {
		return
	}
	var id int64
	var email string
	err := s.db.QueryRow(`SELECT id,email FROM users WHERE lower(email)=lower($1)`, normalizeEmail(input.Email)).Scan(&id, &email)
	if err == nil {
		if token, issueErr := s.issueToken(id, "reset_password", 30*time.Minute); issueErr == nil {
			log.Printf("DEV password reset link for %s: %s", email, s.tokenURL("/reset-password", token))
		} else {
			log.Printf("password reset token error: %v", issueErr)
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "Если аккаунт с таким email существует, мы отправили письмо для восстановления пароля."})
}

func (s *authService) resetPassword(w http.ResponseWriter, r *http.Request) {
	var input struct{ Token, Password string }
	if !decodeJSON(w, r, &input) {
		return
	}
	hash, err := passwordHash(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_password", err.Error())
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	var userID int64
	err = tx.QueryRow(`UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND type='reset_password' AND used_at IS NULL AND expires_at>now() RETURNING user_id`, tokenHash(input.Token)).Scan(&userID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_token", "Ссылка недействительна или устарела.")
		return
	}
	if _, err = tx.Exec(`UPDATE users SET password_hash=$1,email_verified_at=coalesce(email_verified_at,now()),updated_at=now() WHERE id=$2`, hash, userID); err != nil {
		serverError(w, err)
		return
	}
	if _, err = tx.Exec(`DELETE FROM sessions WHERE user_id=$1`, userID); err != nil {
		serverError(w, err)
		return
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, destination interface{}) bool {
	if r.Header.Get("Content-Type") != "" && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "invalid_content_type", "Ожидается JSON-запрос.")
		return false
	}
	if err := json.NewDecoder(r.Body).Decode(destination); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Проверьте данные формы.")
		return false
	}
	return true
}
