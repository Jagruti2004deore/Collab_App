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

    public ChatMessageDTO saveMessage(
            String roomId,
            String sender,
            String content,
            String type,
            String fileName,
            String fileType) {

        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found: " + roomId));

        ChatMessage message = ChatMessage.builder()
                .room(room)
                .sender(sender)
                .content(content)
                .messageType(type != null ? type : "CHAT")
                .fileName(fileName)
                .fileType(fileType)
                .build();

        ChatMessage saved = chatMessageRepository.save(message);

        ChatMessageDTO.MessageType msgType;
        try {
            msgType = ChatMessageDTO.MessageType.valueOf(
                saved.getMessageType() != null ? saved.getMessageType() : "CHAT"
            );
        } catch (IllegalArgumentException e) {
            msgType = ChatMessageDTO.MessageType.CHAT;
        }

        return ChatMessageDTO.builder()
                .roomId(roomId)
                .sender(saved.getSender())
                .content(saved.getContent())
                .sentAt(saved.getSentAt())
                .type(msgType)
                .fileName(saved.getFileName())
                .fileType(saved.getFileType())
                .build();
    }

    // Overload for backward compatibility
    public ChatMessageDTO saveMessage(String roomId, String sender, String content) {
        return saveMessage(roomId, sender, content, "CHAT", null, null);
    }

    public List<ChatMessageDTO> getMessageHistory(String roomId) {
        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found: " + roomId));

        return chatMessageRepository.findTop50ByRoomOrderBySentAtAsc(room)
                .stream()
                .map(msg -> {
                    ChatMessageDTO.MessageType msgType;
                    try {
                        msgType = ChatMessageDTO.MessageType.valueOf(
                            msg.getMessageType() != null ? msg.getMessageType() : "CHAT"
                        );
                    } catch (IllegalArgumentException e) {
                        msgType = ChatMessageDTO.MessageType.CHAT;
                    }
                    return ChatMessageDTO.builder()
                            .roomId(roomId)
                            .sender(msg.getSender())
                            .content(msg.getContent())
                            .sentAt(msg.getSentAt())
                            .type(msgType)
                            .fileName(msg.getFileName())
                            .fileType(msg.getFileType())
                            .build();
                })
                .collect(Collectors.toList());
    }
}