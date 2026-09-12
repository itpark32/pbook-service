package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi"
)

type exerciseProgress struct {
	ExerciseID       string  `json:"exerciseId"`
	Completed        bool    `json:"completed"`
	AttemptsCount    int     `json:"attemptsCount"`
	PassedTests      *int    `json:"passedTests,omitempty"`
	TotalTests       *int    `json:"totalTests,omitempty"`
	Code             *string `json:"code,omitempty"`
	Stdin            *string `json:"stdin,omitempty"`
	SolutionRevealed bool    `json:"solutionRevealed"`
}

type lessonProgress struct {
	LessonID string `json:"lessonId"`
	Status   string `json:"status"`
}

func (s *authService) progressUser(w http.ResponseWriter, r *http.Request) (*authUser, bool) {
	user, err := s.currentUser(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "Нужно войти в аккаунт.")
		return nil, false
	}
	return user, true
}

func (s *authService) getProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.progressUser(w, r)
	if !ok {
		return
	}
	exercises, err := s.userExercises(user.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	lessons, err := s.userLessons(user.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"exercises": exercises, "lessons": lessons})
}

func (s *authService) userExercises(userID int64) ([]exerciseProgress, error) {
	rows, err := s.db.Query(`SELECT exercise_id,completed,attempts_count,passed_tests,total_tests,code,stdin,solution_revealed FROM exercise_progress WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]exerciseProgress, 0)
	for rows.Next() {
		var item exerciseProgress
		if err = rows.Scan(&item.ExerciseID, &item.Completed, &item.AttemptsCount, &item.PassedTests, &item.TotalTests, &item.Code, &item.Stdin, &item.SolutionRevealed); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *authService) userLessons(userID int64) ([]lessonProgress, error) {
	rows, err := s.db.Query(`SELECT lesson_id,status FROM lesson_progress WHERE user_id=$1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]lessonProgress, 0)
	for rows.Next() {
		var item lessonProgress
		if err = rows.Scan(&item.LessonID, &item.Status); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *authService) saveExerciseProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.progressUser(w, r)
	if !ok {
		return
	}
	exerciseID := chi.URLParam(r, "exerciseID")
	if strings.TrimSpace(exerciseID) == "" {
		writeError(w, http.StatusBadRequest, "invalid_exercise", "Некорректное упражнение.")
		return
	}
	var input struct {
		Code             *string `json:"code"`
		Stdin            *string `json:"stdin"`
		SolutionRevealed bool    `json:"solutionRevealed"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if (input.Code != nil && len(*input.Code) > 1024*1024) || (input.Stdin != nil && len(*input.Stdin) > 1024*1024) {
		writeError(w, http.StatusBadRequest, "progress_too_large", "Код или ввод слишком большой.")
		return
	}
	_, err := s.db.Exec(`INSERT INTO exercise_progress(user_id,exercise_id,code,stdin,solution_revealed) VALUES($1,$2,$3,$4,$5)
		ON CONFLICT(user_id,exercise_id) DO UPDATE SET code=coalesce(EXCLUDED.code,exercise_progress.code),stdin=coalesce(EXCLUDED.stdin,exercise_progress.stdin),solution_revealed=exercise_progress.solution_revealed OR EXCLUDED.solution_revealed,updated_at=now()`, user.ID, exerciseID, input.Code, input.Stdin, input.SolutionRevealed)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) recordAttempt(w http.ResponseWriter, r *http.Request) {
	user, ok := s.progressUser(w, r)
	if !ok {
		return
	}
	exerciseID := chi.URLParam(r, "exerciseID")
	var input struct {
		Passed      bool   `json:"passed"`
		PassedTests int    `json:"passedTests"`
		TotalTests  int    `json:"totalTests"`
		LessonID    string `json:"lessonId"`
		Checkpoint  bool   `json:"checkpoint"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if exerciseID == "" || input.PassedTests < 0 || input.TotalTests < 0 || input.PassedTests > input.TotalTests {
		writeError(w, http.StatusBadRequest, "invalid_attempt", "Некорректный результат проверки.")
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	_, err = tx.Exec(`INSERT INTO exercise_progress(user_id,exercise_id,completed,attempts_count,passed_tests,total_tests,completed_at) VALUES($1,$2,$3,1,$4,$5,CASE WHEN $3 THEN now() END)
		ON CONFLICT(user_id,exercise_id) DO UPDATE SET attempts_count=exercise_progress.attempts_count+1,passed_tests=EXCLUDED.passed_tests,total_tests=EXCLUDED.total_tests,completed=exercise_progress.completed OR EXCLUDED.completed,completed_at=coalesce(exercise_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`, user.ID, exerciseID, input.Passed, input.PassedTests, input.TotalTests)
	if err != nil {
		serverError(w, err)
		return
	}
	if input.Passed && input.Checkpoint && strings.TrimSpace(input.LessonID) != "" {
		_, err = tx.Exec(`INSERT INTO lesson_progress(user_id,lesson_id,status,completed_at) VALUES($1,$2,'completed',now()) ON CONFLICT(user_id,lesson_id) DO UPDATE SET status='completed',completed_at=coalesce(lesson_progress.completed_at,now()),updated_at=now()`, user.ID, input.LessonID)
		if err != nil {
			serverError(w, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) saveLessonProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.progressUser(w, r)
	if !ok {
		return
	}
	lessonID := chi.URLParam(r, "lessonID")
	var input struct {
		Status string `json:"status"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	if lessonID == "" || (input.Status != "in_progress" && input.Status != "completed") {
		writeError(w, http.StatusBadRequest, "invalid_lesson", "Некорректный статус урока.")
		return
	}
	_, err := s.db.Exec(`INSERT INTO lesson_progress(user_id,lesson_id,status,completed_at) VALUES($1,$2,$3,CASE WHEN $3='completed' THEN now() END) ON CONFLICT(user_id,lesson_id) DO UPDATE SET status=CASE WHEN lesson_progress.status='completed' THEN 'completed' ELSE EXCLUDED.status END,completed_at=coalesce(lesson_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`, user.ID, lessonID, input.Status)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

type progressImport struct {
	Exercises       []exerciseProgress `json:"exercises"`
	Lessons         []lessonProgress   `json:"lessons"`
	CodeResolutions map[string]string  `json:"codeResolutions"`
}

func (s *authService) importProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.progressUser(w, r)
	if !ok {
		return
	}
	var input progressImport
	if !decodeJSON(w, r, &input) {
		return
	}
	for _, resolution := range input.CodeResolutions {
		if resolution != "local" && resolution != "cloud" {
			writeError(w, http.StatusBadRequest, "invalid_progress_resolution", "Выберите одну из версий кода.")
			return
		}
	}
	conflicts := make([]map[string]string, 0)
	for _, local := range input.Exercises {
		if local.Code == nil || *local.Code == "" {
			continue
		}
		var cloud sql.NullString
		err := s.db.QueryRow(`SELECT code FROM exercise_progress WHERE user_id=$1 AND exercise_id=$2`, user.ID, local.ExerciseID).Scan(&cloud)
		if err == nil && cloud.Valid && cloud.String != "" && cloud.String != *local.Code && input.CodeResolutions[local.ExerciseID] == "" {
			conflicts = append(conflicts, map[string]string{"exerciseId": local.ExerciseID, "localCode": *local.Code, "cloudCode": cloud.String})
		}
	}
	if len(conflicts) > 0 {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{"error": map[string]string{"code": "progress_conflict", "message": "Код отличается между устройством и аккаунтом."}, "conflicts": conflicts})
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		serverError(w, err)
		return
	}
	defer tx.Rollback()
	for _, local := range input.Exercises {
		if local.ExerciseID == "" {
			continue
		}
		if local.Code != nil && len(*local.Code) > 1024*1024 {
			writeError(w, http.StatusBadRequest, "progress_too_large", "Код слишком большой.")
			return
		}
		code := local.Code
		if input.CodeResolutions[local.ExerciseID] == "cloud" {
			code = nil
		}
		_, err = tx.Exec(`INSERT INTO exercise_progress(user_id,exercise_id,completed,code,stdin,solution_revealed,completed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $3 THEN now() END) ON CONFLICT(user_id,exercise_id) DO UPDATE SET completed=exercise_progress.completed OR EXCLUDED.completed,code=coalesce(EXCLUDED.code,exercise_progress.code),stdin=coalesce(exercise_progress.stdin,EXCLUDED.stdin),solution_revealed=exercise_progress.solution_revealed OR EXCLUDED.solution_revealed,completed_at=coalesce(exercise_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`, user.ID, local.ExerciseID, local.Completed, code, local.Stdin, local.SolutionRevealed)
		if err != nil {
			serverError(w, err)
			return
		}
	}
	for _, local := range input.Lessons {
		if local.LessonID == "" {
			continue
		}
		status := local.Status
		if status != "completed" {
			status = "in_progress"
		}
		_, err = tx.Exec(`INSERT INTO lesson_progress(user_id,lesson_id,status,completed_at) VALUES($1,$2,$3,CASE WHEN $3='completed' THEN now() END) ON CONFLICT(user_id,lesson_id) DO UPDATE SET status=CASE WHEN lesson_progress.status='completed' OR EXCLUDED.status='completed' THEN 'completed' ELSE 'in_progress' END,completed_at=coalesce(lesson_progress.completed_at,EXCLUDED.completed_at),updated_at=now()`, user.ID, local.LessonID, status)
		if err != nil {
			serverError(w, err)
			return
		}
	}
	if err = tx.Commit(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
