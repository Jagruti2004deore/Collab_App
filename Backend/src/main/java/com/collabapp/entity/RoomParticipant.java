package com.collabapp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(
    name = "room_participants",
    uniqueConstraints = @UniqueConstraint(
        name = "uk_room_participant",
        columnNames = {"room_id_fk", "user_id_fk"}
    ),
    indexes = {
        @Index(name = "idx_room_participant_room_status", columnList = "room_id_fk,status"),
        @Index(name = "idx_room_participant_user_status", columnList = "user_id_fk,status")
    }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomParticipant {

    public enum Role {
        OWNER,
        PARTICIPANT
    }

    public enum Status {
        PENDING,
        APPROVED,
        REJECTED,
        BLOCKED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id_fk", nullable = false)
    private Room room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id_fk", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Role role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private LocalDateTime requestedAt;

    @Column(name = "decided_at")
    private LocalDateTime decidedAt;

    @PrePersist
    protected void onCreate() {
        requestedAt = LocalDateTime.now();
    }
}
