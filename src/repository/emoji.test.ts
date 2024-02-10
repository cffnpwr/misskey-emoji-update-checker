import { drizzle } from "drizzle-orm/d1";
import { beforeAll, describe, expect, test } from "vitest";
import { getBindingsProxy } from "wrangler";
import { aliases } from "./alias";
import { EmojiRepository, emojis } from "./emoji";

describe("EmojiRepository", async () => {
	const { bindings } = await getBindingsProxy();
	// biome-ignore lint/complexity/useLiteralKeys: <explanation>
	const d1: D1Database = bindings["DB"] as D1Database;

	let emojiRepository: EmojiRepository;

	const initialData = [
		{
			name: "grinning",
			category: "people",
			url: "https://example.com/grinning.png",
			aliases: ["smile"],
			updatedAt: new Date("2021-01-01T00:00:00Z"),
		},
		{
			name: "smile",
			category: "people",
			url: "https://example.com/smile.png",
			aliases: ["grinning", "smile"],
			updatedAt: new Date("2022-01-01T00:00:00Z"),
		},
		{
			name: "smiley",
			category: "people",
			url: "https://example.com/smiley.png",
			aliases: [],
			updatedAt: new Date("2024-02-11T00:00:00+09:00"),
		},
    {
      name: "dummy",
      category: "dummy",
      url: "https://example.com/dummy.png",
      aliases: [],
      updatedAt: new Date("2024-02-11T00:00:00+09:00"),
    }
	];
	beforeAll(async () => {
		emojiRepository = new EmojiRepository(d1);

		const db = drizzle(d1);

		await db.delete(emojis);
		await db.insert(emojis).values(initialData).execute();
		await db
			.insert(aliases)
			.values(
				initialData.flatMap((emoji) =>
					emoji.aliases.map((alias) => ({ name: emoji.name, alias })),
				),
			)
			.execute();
	});

	test("存在する絵文字を取得できる", async () => {
		const emoji = await emojiRepository.get("grinning");

		expect(emoji.result).toEqual("ok");
		expect("value" in emoji && emoji.value).toEqual({
			name: "grinning",
			category: "people",
			url: "https://example.com/grinning.png",
			aliases: ["smile"],
			updatedAt: expect.any(Date),
		});

		const emoji2 = await emojiRepository.get("smile");
		expect(emoji2.result).toEqual("ok");
		expect("value" in emoji2 && emoji2.value).toEqual({
			name: "smile",
			category: "people",
			url: "https://example.com/smile.png",
			aliases: ["grinning", "smile"],
			updatedAt: expect.any(Date),
		});
	});

	test("存在しない絵文字を取得できない", async () => {
		const emoji = await emojiRepository.get("not-exist");

		expect(emoji.result).toEqual("err");
	});

  test("絵文字一覧を取得できる", async () => {
    const result = await emojiRepository.list();

    expect(result).toEqual([
      {
        name: "grinning",
        category: "people",
        url: "https://example.com/grinning.png",
        aliases: ["smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smile",
        category: "people",
        url: "https://example.com/smile.png",
        aliases: ["grinning", "smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smiley",
        category: "people",
        url: "https://example.com/smiley.png",
        aliases: [],
        updatedAt: expect.any(Date),
      },
      {
        name: "dummy",
        category: "dummy",
        url: "https://example.com/dummy.png",
        aliases: [],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  test("カテゴリーで絵文字一覧を取得できる", async () => {
    const result = await emojiRepository.list({ category: "people" });

    expect(result).toEqual([
      {
        name: "grinning",
        category: "people",
        url: "https://example.com/grinning.png",
        aliases: ["smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smile",
        category: "people",
        url: "https://example.com/smile.png",
        aliases: ["grinning", "smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smiley",
        category: "people",
        url: "https://example.com/smiley.png",
        aliases: [],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  test("更新日時で絵文字一覧を取得できる", async () => {
    const result = await emojiRepository.list({
      sinse: new Date("2023-01-01T00:00:00Z"),
    });

    expect(result).toEqual([
      {
        name: "smiley",
        category: "people",
        url: "https://example.com/smiley.png",
        aliases: [],
        updatedAt: expect.any(Date),
      },
      {
        name: "dummy",
        category: "dummy",
        url: "https://example.com/dummy.png",
        aliases: [],
        updatedAt: expect.any(Date),
      },
    ]);

    const result2 = await emojiRepository.list({
      until: new Date("2023-01-01T00:00:00Z"),
    });

    expect(result2).toEqual([
      {
        name: "grinning",
        category: "people",
        url: "https://example.com/grinning.png",
        aliases: ["smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smile",
        category: "people",
        url: "https://example.com/smile.png",
        aliases: ["grinning", "smile"],
        updatedAt: expect.any(Date),
      },
    ]);

    const result3 = await emojiRepository.list({
      sinse: new Date("2022-01-01T00:00:00Z"),
      until: new Date("2023-01-01T00:00:00Z"),
    });

    expect(result3).toEqual([
      {
        name: "smile",
        category: "people",
        url: "https://example.com/smile.png",
        aliases: ["grinning", "smile"],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  test("エイリアスで絵文字一覧を取得できる", async () => {
    const result = await emojiRepository.list({ alias: "smile" });

    expect(result).toEqual([
      {
        name: "grinning",
        category: "people",
        url: "https://example.com/grinning.png",
        aliases: ["smile"],
        updatedAt: expect.any(Date),
      },
      {
        name: "smile",
        category: "people",
        url: "https://example.com/smile.png",
        aliases: ["grinning", "smile"],
        updatedAt: expect.any(Date),
      },
    ]);
  });

	test("絵文字を追加できる", async () => {
		const emoji = {
			name: "new-emoji",
			category: "people",
			url: "https://example.com/new-emoji.png",
			aliases: ["new"],
			updatedAt: new Date(),
		};

		const result = await emojiRepository.save(emoji);

		expect(result.result).toEqual("ok");
		expect("value" in result && result.value).toEqual(emoji);
	});

  test("絵文字を更新できる", async () => {
    const emoji = {
      name: "grinning",
      category: "people",
      url: "https://example.com/grinning.png",
      aliases: ["smile", "grinning"],
      updatedAt: new Date(),
    };

    const result = await emojiRepository.save(emoji);

    expect(result.result).toEqual("ok");
    expect("value" in result && result.value).toEqual(emoji);
  });

  test("絵文字を削除できる", async () => {
    const result = await emojiRepository.delete("smile");

    expect(result.result).toEqual("ok");
    expect("value" in result && result.value).toEqual({
			name: "smile",
			category: "people",
			url: "https://example.com/smile.png",
			aliases: ["grinning", "smile"],
			updatedAt: expect.any(Date),
		},);
  });

  test("存在しない絵文字を削除できない", async () => {
    const result = await emojiRepository.delete("not-exist");

    expect(result.result).toEqual("err");
  });
});
