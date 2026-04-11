package com.collabapp.repository;

import com.collabapp.entity.ChatMessage;
import com.collabapp.entity.Room;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // Load last 50 messages for a room, oldest first
    List<ChatMessage> findTop50ByRoomOrderBySentAtAsc(Room room);
}