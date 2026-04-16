package com.collabapp.service;

import com.collabapp.dto.*;
import com.collabapp.entity.Room;
import com.collabapp.entity.User;
import com.collabapp.repository.ChatMessageRepository;
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
    private final ChatMessageRepository chatMessageRepository;

    public RoomResponse createRoom(CreateRoomRequest request, String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));

        Room room = Room.builder()
                .roomId(UUID.randomUUID().toString())
                .roomName(request.getRoomName())
                .createdBy(user)
                .build();

        roomRepository.save(room);
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
        User user = userRepository.findByUsername(username)
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

    private RoomResponse toResponse(Room room) {
        return RoomResponse.builder()
                .roomId(room.getRoomId())
                .roomName(room.getRoomName())
                .createdBy(room.getCreatedBy().getUsername())
                .createdAt(room.getCreatedAt())
                .build();
    }
}