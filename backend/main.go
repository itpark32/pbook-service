package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi"
	_ "github.com/lib/pq"
)

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("backend error: %v", err)
	writeError(w, http.StatusInternalServerError, "internal_error", "Внутренняя ошибка сервера.")
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]map[string]string{
		"error": {"code": code, "message": message},
	})
}

func router() http.Handler { return routerWithAuth(nil) }

func routerWithAuth(auth *authService) http.Handler {
	r := chi.NewRouter()
	r.Get("/api/v1/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	if auth != nil {
		r.Post("/api/v1/auth/login", auth.protect("login", auth.login))
		r.Post("/api/v1/auth/logout", auth.protect("logout", auth.logout))
		r.Get("/api/v1/auth/me", auth.me)
		r.Post("/api/v1/auth/verify-email", auth.protect("verify", auth.verifyEmail))
		r.Post("/api/v1/auth/resend-verification", auth.protect("resend", auth.resendVerification))
		r.Post("/api/v1/auth/forgot-password", auth.protect("forgot", auth.forgotPassword))
		r.Post("/api/v1/auth/reset-password", auth.protect("reset", auth.resetPassword))

		r.Get("/api/v1/invites/{token}", auth.limit("invite_validation", auth.showInvite))
		r.Post("/api/v1/invites/teacher", auth.protect("teacher_invite", auth.createTeacherInvite))
		r.Post("/api/v1/invites/{token}/register", auth.protect("invite_registration", auth.registerFromInvite))
		r.Post("/api/v1/invites/{token}/join", auth.protect("invite_join", auth.joinInvite))
		r.Post("/api/v1/invites/{token}/revoke", auth.protect("invite_revoke", auth.revokeInvite))
		r.Post("/api/v1/groups", auth.protect("group_create", auth.createGroup))
		r.Get("/api/v1/groups", auth.teacherGroups)
		r.Patch("/api/v1/groups/{groupID}", auth.protect("group_rename", auth.renameGroup))
		r.Delete("/api/v1/groups/{groupID}", auth.protect("group_delete", auth.deleteGroup))
		r.Delete("/api/v1/groups/{groupID}/members/{userID}", auth.protect("member_remove", auth.removeGroupMember))
		r.Post("/api/v1/groups/{groupID}/student-invite", auth.protect("student_invite", auth.createStudentInvite))
		r.Get("/api/v1/progress", auth.getProgress)
		r.Put("/api/v1/progress/exercises/{exerciseID}", auth.protect("progress_save", auth.saveExerciseProgress))
		r.Post("/api/v1/progress/exercises/{exerciseID}/attempt", auth.protect("progress_attempt", auth.recordAttempt))
		r.Put("/api/v1/progress/lessons/{lessonID}", auth.protect("progress_lesson", auth.saveLessonProgress))
		r.Post("/api/v1/progress/import", auth.protect("progress_import", auth.importProgress))
		r.Get("/api/v1/teacher/groups/{groupID}/students", auth.teacherGroupStudents)
		r.Get("/api/v1/teacher/students/{studentID}", auth.teacherStudentCard)
		r.Get("/api/v1/teacher/students/{studentID}/exercises/{exerciseID}", auth.teacherStudentExercise)
		r.Get("/api/v1/admin/users", auth.adminUsers)
		r.Patch("/api/v1/admin/users/{userID}/status", auth.protect("admin_user_status", auth.adminChangeUserStatus))
		r.Get("/api/v1/admin/invites", auth.adminInvites)
		r.Post("/api/v1/admin/invites/{inviteID}/revoke", auth.protect("admin_invite_revoke", auth.adminRevokeInvite))
		r.Get("/api/v1/admin/teacher-tree", auth.adminTeacherTree)
	}
	return r
}

func migrate(db *sql.DB) error {
	directory := os.Getenv("MIGRATIONS_DIR")
	if directory == "" {
		directory = "../migrations"
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		contents, readErr := os.ReadFile(filepath.Join(directory, entry.Name()))
		if readErr != nil {
			return readErr
		}
		if _, execErr := db.Exec(string(contents)); execErr != nil {
			return execErr
		}
	}
	return nil
}

func bootstrapAdmin(db *sql.DB) error {
	email := normalizeEmail(os.Getenv("BOOTSTRAP_ADMIN_EMAIL"))
	password := os.Getenv("BOOTSTRAP_ADMIN_PASSWORD")
	if email == "" || password == "" {
		return nil
	}
	hash, err := passwordHash(password)
	if err != nil {
		return err
	}
	_, err = db.Exec(`INSERT INTO users(email,password_hash,role,status,full_name,email_verified_at) VALUES($1,$2,'admin','active','Администратор',now()) ON CONFLICT (lower(email)) DO NOTHING`, email, hash)
	return err
}

func cookieSecureFromEnvironment() bool {
	return !strings.EqualFold(os.Getenv("COOKIE_SECURE"), "false")
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		log.Fatal(err)
	}
	if err = migrate(db); err != nil {
		log.Fatal(err)
	}
	if err = bootstrapAdmin(db); err != nil {
		log.Fatal(err)
	}
	// HTTPS is the safe default. Local docker-compose deliberately sets
	// COOKIE_SECURE=false because its development URL is plain HTTP.
	auth := &authService{db: db, cookieSecure: cookieSecureFromEnvironment(), appOrigin: os.Getenv("APP_ORIGIN"), attempts: make(map[string][]time.Time)}

	log.Printf("backend listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, routerWithAuth(auth)))
}
