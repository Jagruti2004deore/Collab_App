package com.collabapp.service;

import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomPresenceService {

    // Map of roomId → Set of online usernames
    // ConcurrentHashMap is thread-safe for WebSocket concurrent access
    private final Map<String, Set<String>> roomUsers =
            new ConcurrentHashMap<>();

    // Add a user to a room's online set
    public void addUser(String roomId, String username) {
        roomUsers
            .computeIfAbsent(roomId, k -> ConcurrentHashMap.newKeySet())
            .add(username);
    }

    // Remove a user from a room's online set
    public void removeUser(String roomId, String username) {
        Set<String> users = roomUsers.get(roomId);
        if (users != null) {
            users.remove(username);
            if (users.isEmpty()) {
                roomUsers.remove(roomId);
            }
        }
    }

    // Get all online users in a room
    public Set<String> getOnlineUsers(String roomId) {
        return roomUsers.getOrDefault(roomId, Collections.emptySet());
    }

    // Remove a user from ALL rooms — used on full disconnect
    public void removeUserFromAllRooms(String username) {
        roomUsers.values().forEach(users -> users.remove(username));
    }

    // Find which rooms a user is currently in
    public List<String> getRoomsForUser(String username) {
        List<String> rooms = new ArrayList<>();
        roomUsers.forEach((roomId, users) -> {
            if (users.contains(username)) {
                rooms.add(roomId);
            }
        });
        return rooms;
    }
}