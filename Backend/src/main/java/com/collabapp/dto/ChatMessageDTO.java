package com.collabapp.dto;

import lombok.*;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ChatMessageDTO {

    private String roomId;
    private String sender;
    private String content;
    private LocalDateTime sentAt;

    // Message type — helps the frontend know what kind of event this is
    public enum MessageType {
        CHAT,       // regular chat message
        JOIN,       // user joined notification
        LEAVE       // user left notification
    }

    private MessageType type;
}