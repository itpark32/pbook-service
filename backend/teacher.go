package main

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi"
)

type teacherPracticumProgress struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Completed int    `json:"completed"`
	Total     int    `json:"total"`
}

type teacherStudent struct {
	ID                 int64                      `json:"id"`
	FullName           *string                    `json:"fullName,omitempty"`
	Email              string                     `json:"email"`
	BirthYear          *int                       `json:"birthYear,omitempty"`
	City               *string                    `json:"city,omitempty"`
	InstitutionName    *string                    `json:"institutionName,omitempty"`
	ClassOrGroup       *string                    `json:"classOrGroup,omitempty"`
	CompletedLessons   int                        `json:"completedLessons"`
	CompletedExercises int                        `json:"completedExercises"`
	Practicums         []teacherPracticumProgress `json:"practicums"`
}

type teacherExerciseProgress struct {
	ExerciseID       string  `json:"exerciseId"`
	Completed        bool    `json:"completed"`
	AttemptsCount    int     `json:"attemptsCount"`
	PassedTests      *int    `json:"passedTests,omitempty"`
	TotalTests       *int    `json:"totalTests,omitempty"`
	Code             *string `json:"code,omitempty"`
	Stdin            *string `json:"stdin,omitempty"`
	SolutionRevealed bool    `json:"solutionRevealed"`
}

func (s *authService) teacherGroupStudents(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	groupID, ok := s.ownGroupID(w, r, teacher.ID)
	if !ok {
		return
	}
	students, err := s.studentsForGroup(groupID)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"students": students})
}

func (s *authService) studentsForGroup(groupID int64) ([]teacherStudent, error) {
	rows, err := s.db.Query(`SELECT u.id,u.full_name,u.email,u.birth_year,u.city,u.institution_name,u.class_or_group,
		count(DISTINCT CASE WHEN lp.status='completed' THEN lp.lesson_id END),
		count(DISTINCT CASE WHEN ep.completed THEN ep.exercise_id END)
		FROM group_memberships gm
		JOIN users u ON u.id=gm.user_id AND u.role='student'
		LEFT JOIN lesson_progress lp ON lp.user_id=u.id
		LEFT JOIN exercise_progress ep ON ep.user_id=u.id
		WHERE gm.group_id=$1
		GROUP BY u.id,u.full_name,u.email,u.birth_year,u.city,u.institution_name,u.class_or_group
		ORDER BY coalesce(u.full_name,u.email),u.id`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	students := make([]teacherStudent, 0)
	for rows.Next() {
		var student teacherStudent
		if err = rows.Scan(&student.ID, &student.FullName, &student.Email, &student.BirthYear, &student.City, &student.InstitutionName, &student.ClassOrGroup, &student.CompletedLessons, &student.CompletedExercises); err != nil {
			return nil, err
		}
		student.Practicums, err = s.studentPracticums(student.ID)
		if err != nil {
			return nil, err
		}
		students = append(students, student)
	}
	return students, rows.Err()
}

func (s *authService) studentPracticums(studentID int64) ([]teacherPracticumProgress, error) {
	result := make([]teacherPracticumProgress, 0, len(teacherCoursePracticums))
	for _, practicum := range teacherCoursePracticums {
		var completed int
		if err := s.db.QueryRow(`SELECT count(*) FROM exercise_progress WHERE user_id=$1 AND completed=true AND exercise_id LIKE $2`, studentID, practicum.ID+"-task-%").Scan(&completed); err != nil {
			return nil, err
		}
		result = append(result, teacherPracticumProgress{
			ID: practicum.ID, Title: practicum.Title, Completed: completed, Total: practicum.Total,
		})
	}
	return result, nil
}

func (s *authService) ownStudent(w http.ResponseWriter, r *http.Request, teacherID int64) (int64, bool) {
	studentID, err := routeID(r, "studentID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_student", "Некорректный ученик.")
		return 0, false
	}
	var available bool
	err = s.db.QueryRow(`SELECT EXISTS(
		SELECT 1 FROM group_memberships gm
		JOIN groups g ON g.id=gm.group_id
		JOIN users u ON u.id=gm.user_id
		WHERE g.teacher_id=$1 AND gm.user_id=$2 AND u.role='student'
	)`, teacherID, studentID).Scan(&available)
	if err != nil {
		serverError(w, err)
		return 0, false
	}
	if !available {
		writeError(w, http.StatusForbidden, "forbidden", "Ученик недоступен.")
		return 0, false
	}
	return studentID, true
}

func (s *authService) teacherStudentCard(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	studentID, ok := s.ownStudent(w, r, teacher.ID)
	if !ok {
		return
	}
	student, err := s.studentCard(studentID)
	if err != nil {
		serverError(w, err)
		return
	}
	lessons, err := s.userLessons(studentID)
	if err != nil {
		serverError(w, err)
		return
	}
	exercises, err := s.userExercises(studentID)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"student":   student,
		"course":    map[string]int{"totalLessons": len(teacherCourseLessons), "totalExercises": teacherCourseExerciseCount},
		"lessons":   lessons,
		"exercises": exercises,
	})
}

func (s *authService) studentCard(studentID int64) (teacherStudent, error) {
	var student teacherStudent
	err := s.db.QueryRow(`SELECT u.id,u.full_name,u.email,u.birth_year,u.city,u.institution_name,u.class_or_group,
		(SELECT count(*) FROM lesson_progress WHERE user_id=u.id AND status='completed'),
		(SELECT count(*) FROM exercise_progress WHERE user_id=u.id AND completed=true)
		FROM users u WHERE u.id=$1 AND u.role='student'`, studentID).Scan(
		&student.ID, &student.FullName, &student.Email, &student.BirthYear, &student.City, &student.InstitutionName, &student.ClassOrGroup, &student.CompletedLessons, &student.CompletedExercises,
	)
	if err != nil {
		return student, err
	}
	student.Practicums, err = s.studentPracticums(studentID)
	return student, err
}

func (s *authService) teacherStudentExercise(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	studentID, ok := s.ownStudent(w, r, teacher.ID)
	if !ok {
		return
	}
	exerciseID := chi.URLParam(r, "exerciseID")
	if exerciseID == "" {
		writeError(w, http.StatusBadRequest, "invalid_exercise", "Некорректное упражнение.")
		return
	}
	var progress teacherExerciseProgress
	err := s.db.QueryRow(`SELECT exercise_id,completed,attempts_count,passed_tests,total_tests,code,stdin,solution_revealed
		FROM exercise_progress WHERE user_id=$1 AND exercise_id=$2`, studentID, exerciseID).Scan(
		&progress.ExerciseID, &progress.Completed, &progress.AttemptsCount, &progress.PassedTests, &progress.TotalTests, &progress.Code, &progress.Stdin, &progress.SolutionRevealed,
	)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "progress_not_found", "По этому упражнению пока нет сохранённого прогресса.")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"progress": progress})
}
