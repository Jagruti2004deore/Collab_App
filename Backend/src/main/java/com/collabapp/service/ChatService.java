package com.collabapp.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.collabapp.dto.ChatMessageDTO;
import com.collabapp.entity.ChatMessage;
import com.collabapp.entity.Room;
import com.collabapp.repository.ChatMessageRepository;
import com.collabapp.repository.RoomRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final RoomRepository roomRepository;

    // Save a message to the database and return the DTO
    public ChatMessageDTO saveMessage(String roomId, String sender, String content) {
        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found: " + roomId));

        ChatMessage message = ChatMessage.builder()
                .room(room)
                .sender(sender)
                .content(content)
                .build();

        ChatMessage saved = chatMessageRepository.save(message);

        return ChatMessageDTO.builder()
                .roomId(roomId)
                .sender(saved.getSender())
                .content(saved.getContent())
                .sentAt(saved.getSentAt())
                .type(ChatMessageDTO.MessageType.CHAT)
                .build();
    }

    // Load chat history for a room (called when a user first joins)
    public List<ChatMessageDTO> getMessageHistory(String roomId) {
        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found: " + roomId));

        return chatMessageRepository.findTop50ByRoomOrderBySentAtAsc(room)
                .stream()
                .map(msg -> ChatMessageDTO.builder()
                        .roomId(roomId)
                        .sender(msg.getSender())
                        .content(msg.getContent())
                        .sentAt(msg.getSentAt())
                        .type(ChatMessageDTO.MessageType.CHAT)
                        .build())
                .collect(Collectors.toList());
    }
}