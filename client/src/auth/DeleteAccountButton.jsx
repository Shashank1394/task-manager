import client from "../api/client.js";

export default function DeleteAccountButton({ onDeleted }) {
  const del = async () => {
    if (
      !confirm(
        "Are you sure you want to delete your account? This cannot be undone.",
      )
    )
      return;
    try {
      await client.delete("/auth/account");
      localStorage.removeItem("token");
      onDeleted();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete account");
    }
  };

  return (
    <button
      onClick={del}
      className="text-xs text-gray-500 hover:text-red-400 w-full text-center mt-3"
      type="button"
    >
      Delete Account
    </button>
  );
}
