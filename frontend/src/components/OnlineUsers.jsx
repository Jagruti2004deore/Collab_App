export default function OnlineUsers({ users, currentUser }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm">Online Users</h3>
        <span className="bg-emerald-100 text-emerald-700 text-xs
                         font-medium px-2 py-0.5 rounded-full">
          {users.length}
        </span>
      </div>

      <div className="space-y-1 overflow-y-auto flex-1">
        {users.length === 0 ? (
          <p className="text-xs text-gray-300 text-center mt-4">
            No users online
          </p>
        ) : (
          users.map((username) => (
            <div
              key={username}
              className="flex items-center gap-2.5 px-2 py-1.5
                         rounded-lg hover:bg-gray-50 transition">
              {/* Avatar circle with first letter */}
              <div className={`w-7 h-7 rounded-full flex items-center
                              justify-center text-xs font-bold shrink-0
                              ${username === currentUser
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-gray-100 text-gray-600'}`}>
                {username.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate
                  ${username === currentUser
                    ? 'font-semibold text-indigo-700'
                    : 'text-gray-700'}`}>
                  {username === currentUser ? `${username} (you)` : username}
                </p>
              </div>

              {/* Green dot — always online if in the list */}
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}