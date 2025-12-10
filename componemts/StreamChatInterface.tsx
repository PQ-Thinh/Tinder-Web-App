import { UserProfile } from "@/app/profile/page";
import { getStreamUserToken } from "@/lib/actions/stream";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StreamChat } from "stream-chat";

export default function StreamChatInterface({
  otherUser,
}: {
  otherUser: UserProfile;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const router = useRouter();

  useEffect(() => {
    async function initializeChat() {
        try {
            setError(null)

            const {token, userId, userName, userImage} = 
                await getStreamUserToken();
            setCurrentUserId(userId!);

            const chatClient = StreamChat.getInstance(
                process.env.NEXT_PUBLIC_STREAM_API_KEY!
            );

            await chatClient.connectUser(
                {
                    id: userId!,
                    name: userName,
                    image: userImage,
                },
                token
            );

            const {} = await createOrGetChannel(otherUser.id);
        } catch (error) {
            router.push("/chat");
        } finally {
            setLoading(false);
        }
    }

    if (otherUser) {
      initializeChat();
    }
  }, [otherUser]);

  return <div></div>;
}
