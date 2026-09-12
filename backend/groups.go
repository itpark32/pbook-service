package main

import (
	"database/sql"
	"net/http"
	"strings"
	"time"
)

type groupMember struct {
	ID           int64     `json:"id"`
	FullName     *string   `json:"fullName,omitempty"`
	Email        string    `json:"email"`
	ClassOrGroup *string   `json:"classOrGroup,omitempty"`
	JoinedAt     time.Time `json:"joinedAt"`
}

type teacherGroup struct {
	ID          int64         `json:"id"`
	Name        string        `json:"name"`
	MemberCount int           `json:"memberCount"`
	Members     []groupMember `json:"members"`
}

func (s *authService) ownGroupID(w http.ResponseWriter, r *http.Request, teacherID int64) (int64, bool) {
	groupID, err := routeID(r, "groupID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_group", "Некорректная группа.")
		return 0, false
	}
	var exists bool
	if err = s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM groups WHERE id=$1 AND teacher_id=$2)`, groupID, teacherID).Scan(&exists); err != nil {
		serverError(w, err)
		return 0, false
	}
	if !exists {
		writeError(w, http.StatusForbidden, "forbidden", "Группа недоступна.")
		return 0, false
	}
	return groupID, true
}

func (s *authService) teacherGroups(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	rows, err := s.db.Query(`SELECT g.id,g.name,count(gm.user_id)
		FROM groups g LEFT JOIN group_memberships gm ON gm.group_id=g.id
		WHERE g.teacher_id=$1 GROUP BY g.id,g.name ORDER BY g.created_at DESC`, teacher.ID)
	if err != nil {
		serverError(w, err)
		return
	}
	defer rows.Close()
	groups := make([]teacherGroup, 0)
	for rows.Next() {
		var group teacherGroup
		if err = rows.Scan(&group.ID, &group.Name, &group.MemberCount); err != nil {
			serverError(w, err)
			return
		}
		group.Members, err = s.groupMembers(group.ID)
		if err != nil {
			serverError(w, err)
			return
		}
		groups = append(groups, group)
	}
	if err = rows.Err(); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"groups": groups})
}

func (s *authService) groupMembers(groupID int64) ([]groupMember, error) {
	rows, err := s.db.Query(`SELECT u.id,u.full_name,u.email,u.class_or_group,gm.joined_at
		FROM group_memberships gm JOIN users u ON u.id=gm.user_id
		WHERE gm.group_id=$1 ORDER BY coalesce(u.full_name,u.email),u.id`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	members := make([]groupMember, 0)
	for rows.Next() {
		var member groupMember
		if err = rows.Scan(&member.ID, &member.FullName, &member.Email, &member.ClassOrGroup, &member.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (s *authService) renameGroup(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	groupID, ok := s.ownGroupID(w, r, teacher.ID)
	if !ok {
		return
	}
	var input struct{ Name string }
	if !decodeJSON(w, r, &input) {
		return
	}
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 160 {
		writeError(w, http.StatusBadRequest, "invalid_group", "Название группы должно содержать от 1 до 160 символов.")
		return
	}
	if _, err := s.db.Exec(`UPDATE groups SET name=$1,updated_at=now() WHERE id=$2`, name, groupID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"group": map[string]interface{}{"id": groupID, "name": name}})
}

func (s *authService) deleteGroup(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	groupID, ok := s.ownGroupID(w, r, teacher.ID)
	if !ok {
		return
	}
	if _, err := s.db.Exec(`DELETE FROM groups WHERE id=$1 AND teacher_id=$2`, groupID, teacher.ID); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *authService) removeGroupMember(w http.ResponseWriter, r *http.Request) {
	teacher, ok := s.verifiedTeacher(w, r)
	if !ok {
		return
	}
	groupID, ok := s.ownGroupID(w, r, teacher.ID)
	if !ok {
		return
	}
	memberID, err := routeID(r, "userID")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_user", "Некорректный пользователь.")
		return
	}
	var removedID int64
	err = s.db.QueryRow(`DELETE FROM group_memberships gm
		USING users u
		WHERE gm.group_id=$1 AND gm.user_id=$2 AND u.id=gm.user_id AND u.role='student'
		RETURNING gm.user_id`, groupID, memberID).Scan(&removedID)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "membership_not_found", "Ученик не состоит в этой группе.")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
