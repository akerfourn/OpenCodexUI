import { observer } from "mobx-react-lite";
import { memo, useLayoutEffect, useRef } from "react";

import type { OpenCodexMessage } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { MarkdownMessage } from "./MarkdownMessage";

type ChatMessageListProps = {
  store: RootStore;
};

export const ChatMessageList = observer(function ChatMessageList({ store }: ChatMessageListProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const currentThread = store.currentThread;

  useLayoutEffect(() => {
    const element = endRef.current;

    if (element === null) {
      return;
    }

    element.scrollIntoView({ block: "end" });
  }, [currentThread?.id, store.messages.length]);

  return (
    <div className="messages" ref={messagesRef}>
      {store.messages.map((message) => (
        <MessageRow
          key={message.id}
          id={message.id}
          role={message.role}
          content={message.content}
        />
      ))}
      <div className="messages-end" ref={endRef} aria-hidden="true" />
    </div>
  );
});

type MessageRowProps = {
  id: string;
  role: OpenCodexMessage["role"];
  content: string;
};

const MessageRow = memo(function MessageRow({ id, role, content }: MessageRowProps) {
  return (
    <article className={`message ${role}`} key={id}>
      <MarkdownMessage markdown={content} />
    </article>
  );
});
