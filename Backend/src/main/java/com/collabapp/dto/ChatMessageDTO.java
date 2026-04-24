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

    // Added FILE type and file fields
    public enum MessageType {
        CHAT,
        JOIN,
        LEAVE,
        FILE
    }

    private MessageType type;

    // File fields — null for regular chat messages
    private String fileName;
    private String fileType;
}