import client from "../api/client.js";

export default function LogoutButton({ onLogout }) {
  const logout = async () => {
    const token = localStorage.getItem("token");
    if (token) {
      await client.post("/auth/logout");
    }
    localStorage.removeItem("token");
    onLogout();
  };

  return (
    <button
      onClick={logout}
      className="text-xs text-gray-500 hover:text-red-400 ml-auto"
    >
      Logout
    </button>
  );
}
