package com.collabapp.service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.collabapp.dto.CreateRoomRequest;
import com.collabapp.dto.RoomAccessResponse;
import com.collabapp.dto.RoomResponse;
import com.collabapp.entity.Room;
import com.collabapp.entity.RoomParticipant;
import com.collabapp.entity.User;
import com.collabapp.repository.ChatMessageRepository;
import com.collabapp.repository.RoomParticipantRepository;
import com.collabapp.repository.RoomRepository;
import com.collabapp.repository.UserRepository;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomRepository roomRepository;
    private final UserRepository userRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final RoomParticipantRepository participantRepository;

    @Transactional
    public RoomResponse createRoom(CreateRoomRequest request, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        Room room = Room.builder()
                .roomId(UUID.randomUUID().toString())
                .roomName(request.getRoomName())
                .createdBy(user)
                .build();

        roomRepository.save(room);
        participantRepository.save(RoomParticipant.builder()
                .room(room)
                .user(user)
                .role(RoomParticipant.Role.OWNER)
                .status(RoomParticipant.Status.APPROVED)
                .build());
        return toResponse(room);
    }

    public RoomResponse getRoom(String roomId) {
        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        return toResponse(room);
    }

    public List<RoomResponse> getMyRooms(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        return roomRepository.findByCreatedByOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public List<RoomResponse> getJoinedRooms(String username) {
    // Verify user exists first
    userRepository.findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException("User not found"));

    return chatMessageRepository.findDistinctRoomsByUsername(username)
            .stream()
            .filter(room -> !room.getCreatedBy().getUsername().equals(username))
            .map(this::toResponse)
            .collect(Collectors.toList());
}

    public boolean roomExists(String roomId) {
        return roomRepository.existsByRoomId(roomId);
    }

    @Transactional
    public RoomAccessResponse requestJoin(String roomId, String username) {
        Room room = getRoomEntity(roomId);
        User user = getUser(username);

        RoomParticipant participant = participantRepository.findByRoomAndUser(room, user)
                .orElseGet(() -> RoomParticipant.builder()
                        .room(room)
                        .user(user)
                        .role(RoomParticipant.Role.PARTICIPANT)
                        .status(RoomParticipant.Status.PENDING)
                        .build());

        if (participant.getStatus() == RoomParticipant.Status.REJECTED) {
            participant.setStatus(RoomParticipant.Status.PENDING);
            participant.setDecidedAt(null);
        }

        participantRepository.save(participant);
        return toAccessResponse(participant);
    }

    public RoomAccessResponse getAccessStatus(String roomId, String username) {
        Room room = getRoomEntity(roomId);
        User user = getUser(username);

        return participantRepository.findByRoomAndUser(room, user)
                .map(this::toAccessResponse)
                .orElse(RoomAccessResponse.builder()
                        .roomId(room.getRoomId())
                        .roomName(room.getRoomName())
                        .username(user.getUsername())
                        .requestedBy(room.getCreatedBy().getUsername())
                        .role(RoomParticipant.Role.PARTICIPANT)
                        .status(RoomParticipant.Status.PENDING)
                        .build());
    }

    public List<RoomAccessResponse> getPendingRequests(String roomId, String ownerUsername) {
        Room room = getRoomEntity(roomId);
        assertOwner(room, ownerUsername);

        return participantRepository
                .findByRoomAndStatusOrderByRequestedAtAsc(room, RoomParticipant.Status.PENDING)
                .stream()
                .map(this::toAccessResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public RoomAccessResponse decideJoinRequest(
            String roomId,
            String targetUsername,
            String ownerUsername,
            RoomParticipant.Status status
    ) {
        if (status == RoomParticipant.Status.PENDING) {
            throw new IllegalArgumentException("Decision must be APPROVED, REJECTED, or BLOCKED");
        }

        Room room = getRoomEntity(roomId);
        assertOwner(room, ownerUsername);
        User target = getUser(targetUsername);

        RoomParticipant participant = participantRepository.findByRoomAndUser(room, target)
                .orElseGet(() -> RoomParticipant.builder()
                        .room(room)
                        .user(target)
                        .role(RoomParticipant.Role.PARTICIPANT)
                        .build());
        participant.setStatus(status);
        participant.setDecidedAt(java.time.LocalDateTime.now());

        return toAccessResponse(participantRepository.save(participant));
    }

    public void assertCanAccess(String roomId, String username) {
        Room room = getRoomEntity(roomId);
        User user = getUser(username);

        boolean approved = participantRepository.existsByRoomAndUserAndStatus(
                room,
                user,
                RoomParticipant.Status.APPROVED
        );

        if (!approved) {
            throw new AccessDeniedException("Room access requires owner approval");
        }
    }

    public boolean canAccess(String roomId, String username) {
        try {
            assertCanAccess(roomId, username);
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private Room getRoomEntity(String roomId) {
        return roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
    }

    private User getUser(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }

    private void assertOwner(Room room, String username) {
        if (!room.getCreatedBy().getUsername().equals(username)) {
            throw new AccessDeniedException("Only the room owner can manage join requests");
        }
    }

    private RoomResponse toResponse(Room room) {
        return RoomResponse.builder()
                .roomId(room.getRoomId())
                .roomName(room.getRoomName())
                .createdBy(room.getCreatedBy().getUsername())
                .createdAt(room.getCreatedAt())
                .build();
    }

    private RoomAccessResponse toAccessResponse(RoomParticipant participant) {
        return RoomAccessResponse.builder()
                .roomId(participant.getRoom().getRoomId())
                .roomName(participant.getRoom().getRoomName())
                .username(participant.getUser().getUsername())
                .requestedBy(participant.getRoom().getCreatedBy().getUsername())
                .role(participant.getRole())
                .status(participant.getStatus())
                .requestedAt(participant.getRequestedAt())
                .decidedAt(participant.getDecidedAt())
                .build();
    }
}
