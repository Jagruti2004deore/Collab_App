package com.collabapp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "rooms")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // The public-facing unique ID used in the URL: /room/{roomId}
    @Column(name = "room_id", nullable = false, unique = true, length = 36)
    private String roomId;

    // Human-readable name the creator gives the room
    @Column(name = "room_name", nullable = false, length = 100)
    private String roomName;

    // The user who created this room
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}