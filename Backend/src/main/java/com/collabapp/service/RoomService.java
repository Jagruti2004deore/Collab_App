package com.collabapp.service;

import com.collabapp.dto.*;
import com.collabapp.entity.Room;
import com.collabapp.entity.User;
import com.collabapp.repository.RoomRepository;
import com.collabapp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomRepository roomRepository;
    private final UserRepository userRepository;

    // Create a new room — generate a UUID as the public room ID
    public RoomResponse createRoom(CreateRoomRequest request, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        Room room = Room.builder()
                .roomId(UUID.randomUUID().toString())  // e.g. "a1b2c3d4-..."
                .roomName(request.getRoomName())
                .createdBy(user)
                .build();

        roomRepository.save(room);
        return toResponse(room);
    }

    // Get a single room by its public roomId — used when someone joins via link
    public RoomResponse getRoom(String roomId) {
        Room room = roomRepository.findByRoomId(roomId)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        return toResponse(room);
    }

    // Get all rooms created by this user — shown on the dashboard
    public List<RoomResponse> getMyRooms(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        return roomRepository.findByCreatedByOrderByCreatedAtDesc(user)
                .stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // Check if a room exists — used when validating a join link
    public boolean roomExists(String roomId) {
        return roomRepository.existsByRoomId(roomId);
    }

    // Helper: convert Room entity → RoomResponse DTO
    private RoomResponse toResponse(Room room) {
        return RoomResponse.builder()
                .roomId(room.getRoomId())
                .roomName(room.getRoomName())
                .createdBy(room.getCreatedBy().getUsername())
                .createdAt(room.getCreatedAt())
                .build();
    }
}