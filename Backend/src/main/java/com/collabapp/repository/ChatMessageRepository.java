package com.collabapp.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.collabapp.entity.ChatMessage;
import com.collabapp.entity.Room;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findTop50ByRoomOrderBySentAtAsc(Room room);

    @Query("SELECT DISTINCT m.room FROM ChatMessage m WHERE m.sender = :username")
    List<Room> findDistinctRoomsByUsername(@Param("username") String username);
}