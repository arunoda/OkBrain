import { MoreVertical, FolderOpen, Share2, Printer } from "lucide-react";
import { Conversation } from "./ChatView";

interface ChatHeaderProps {
    conversation: Conversation;
    showMenu: boolean;
    setShowMenu: (show: boolean) => void;
    onMoveToFolder: () => void;
    onShare: () => void;
    onPrint: () => void;
}

export default function ChatHeader({
    conversation,
    showMenu,
    setShowMenu,
    onMoveToFolder,
    onShare,
    onPrint,
}: ChatHeaderProps) {
    return (
        <>
            <div className="chat-print-title">
                {conversation.title}
            </div>
            <div className="chat-header">
                <h1 className="chat-title">{conversation.title}</h1>
                <div className="chat-menu-container">
                    <button
                        className="chat-menu-button"
                        onClick={() => setShowMenu(!showMenu)}
                        aria-label="More options"
                    >
                        <MoreVertical size={20} />
                    </button>
                    {showMenu && (
                        <>
                            <div
                                className="chat-menu-overlay"
                                onClick={() => setShowMenu(false)}
                            />
                            <div className="chat-menu-dropdown">
                                <button
                                    className="chat-menu-item"
                                    onClick={() => {
                                        setShowMenu(false);
                                        onMoveToFolder();
                                    }}
                                >
                                    <FolderOpen size={16} />
                                    <span>Move</span>
                                </button>
                                <button
                                    className="chat-menu-item"
                                    onClick={() => {
                                        setShowMenu(false);
                                        onShare();
                                    }}
                                >
                                    <Share2 size={16} />
                                    <span>Share</span>
                                </button>
                                <button
                                    className="chat-menu-item"
                                    onClick={onPrint}
                                >
                                    <Printer size={16} />
                                    <span>Print</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
