import { Temporal } from "@js-temporal/polyfill";
import type { entities as MisskeyEntities } from "misskey-js";

export type MiEmoji = {
	aliases: string[];
	name: string;
	category: string;
	url: string;
}

export type EmojiResponse = {
	emojis: MiEmoji[];
}

export type DBEmoji = {
	name: string;
	aliases: string[];
	category: string;
	url: string;
	updatedAt: Temporal.PlainDateTime;
}

export type Env = {
  ENV?: "dev";
	MK_URL: string;
	MK_TOKEN: string;
	MK_HOOK_SECRET: string;
	IMAGE_BACKUP_BASE_URL: string;
	IMAGE_BACKUP_PATH: string;
	DB: D1Database;
	BUCKET: R2Bucket;
	KV: KVNamespace;
}

type WebhookTypes = {
	user: "follow" | "followed" | "unfollow";
	note: "note" | "reply" | "renote" | "mention";
};

export type MisskeyWebhook<T = WebhookTypes["user" | "note"]> = {
	hookId: string;
	userId: string;
	eventId: string;
	createdAt: string;
	type: T;
	body: T extends WebhookTypes["user"]
		? {
				user: MisskeyEntities.User;
		  }
		: T extends WebhookTypes["note"]
		  ? {
					note: MisskeyEntities.Note;
			  }
		  : null;
};

export const WebhookTypeCheck = <T extends WebhookTypes["user" | "note"]>(
	type: T,
	json: MisskeyWebhook,
): json is MisskeyWebhook<T> => json.type === type;
