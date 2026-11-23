// Vitest からテスト用の関数を読み込む
// - describe: 関連するテストをグループ化する
// - it: 1つのテストケースを定義する
// - expect: 実際の値と期待する値を比較して検証する
// - afterEach: 各テストの実行後に毎回行う後処理を登録する
// - vi: 時刻の固定など、テスト用の便利機能（モック・タイマー）を提供する
import { afterEach, describe, expect, it, vi } from 'vitest';
// テスト対象（モデル本体とエラークラス）を読み込む
// ※ TypeScript の NodeNext 設定では、元のファイルが .ts でも import 先はコンパイル後の .js で記述する
import { Knowledge, KnowledgeContentRequiredError, KnowledgeTitleRequiredError } from './knowledge.model.js';

// UUID (例: 550e8400-e29b-41d4-a716-446655440000) の形式に一致するか調べる正規表現
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// テストの中で仮想タイマー (vi.useFakeTimers) を使ったあと、
// 次のテストに影響しないよう毎回通常のタイマーへ戻す
afterEach(() => {
  vi.useRealTimers();
});

// Knowledge.create() の動作をまとめるテストグループ
describe('Create Knowledge', () => {
  it('Knowledge が作成できる', () => {
    const title = 'Test Title';
    const content = 'This is a test content.';
    const authorId = 'test-author';
    // 引数は (タイトル, 本文, 作成者ID) の順で渡す
    const knowledge = Knowledge.create(title, content, authorId);

    // toMatch: 文字列が正規表現に一致するか検証する
    expect(knowledge.knowledgeId).toMatch(UUID_PATTERN);
    // toBe: 値（文字列・数値など）が厳密に一致 (===) するか検証する
    expect(knowledge.title).toBe(title);
    expect(knowledge.content).toBe(content);
    expect(knowledge.authorId).toBe(authorId);
    // 新規作成直後は作成日時と更新日時が同じになることを確認する
    expect(knowledge.createdAt).toEqual(knowledge.updatedAt);
  });

  it('Knowledge ごとに一意な knowledgeId が生成される', () => {
    const first = Knowledge.create('First title', 'First content', 'test-author');
    const second = Knowledge.create('Second title', 'Second content', 'test-author');

    // .not を挟むと「一致しないこと」を検証できる
    expect(first.knowledgeId).not.toBe(second.knowledgeId);
  });

  it('空文字と空白だけのタイトルを拒否する', () => {
    // 例外 (throw) を検証するときは、テスト関数が先に落ちてしまわないように
    // アロー関数 () => ... で包んで expect() に渡す
    expect(() => Knowledge.create('', 'Valid content', 'test-author')).toThrow(KnowledgeTitleRequiredError);
    // toThrow に文字列を渡すと、エラーメッセージにその文字が含まれるか検証できる
    expect(() => Knowledge.create(' \n\t ', 'Valid content', 'test-author')).toThrow('タイトルを入力してください');
  });

  it('空文字と空白だけの本文を拒否する', () => {
    expect(() => Knowledge.create('Valid title', '', 'test-author')).toThrow(KnowledgeContentRequiredError);
    expect(() => Knowledge.create('Valid title', ' \n\t ', 'test-author')).toThrow('本文を入力してください');
  });

  it('有効なタイトルと本文の空白を保持する', () => {
    const title = '  Test Title  ';
    const content = '  This is a test content.  ';
    const knowledge = Knowledge.create(title, content, 'test-author');

    // trim() で勝手に前後の空白が削られず、元の文字列のまま保存されることを確認する
    expect(knowledge.title).toBe(title);
    expect(knowledge.content).toBe(content);
  });
});

// Knowledge.update() の動作をまとめるテストグループ
describe('Update Knowledge', () => {
  it('Knowledge が更新できる', () => {
    // テスト内で時間を自在に進められるように、仮想タイマーを有効にする
    vi.useFakeTimers();

    const original = Knowledge.create('Original title', 'This is an original content', 'test-author');
    const content = 'This is an updated content.';

    // 仮想時計を 10 秒 (10000 ミリ秒) 進める
    vi.advanceTimersByTime(10000);

    // 元の Knowledge は直接書き換えず、更新後の新しい Knowledge を受け取る
    const updated = Knowledge.update(original, content);

    // ID・タイトル・作成者・作成日時は変わらず、本文と更新日時だけが変わることを確認する
    expect(updated.knowledgeId).toBe(original.knowledgeId);
    expect(updated.title).toBe(original.title);
    expect(updated.content).toBe(content);
    expect(updated.authorId).toBe(original.authorId);
    expect(updated.createdAt).toEqual(original.createdAt);
    // toBeGreaterThan: 更新日時が作成時より後の時刻になっているか検証する
    expect(updated.updatedAt).toBeGreaterThan(original.updatedAt);
  });

  it('空文字と空白だけの本文を拒否する', () => {
    const original = Knowledge.create('Original title', 'Original content', 'test-author');

    expect(() => Knowledge.update(original, '')).toThrow(KnowledgeContentRequiredError);
    expect(() => Knowledge.update(original, ' \n\t ')).toThrow('本文を入力してください');
  });
});

// Knowledge.sortByUpdatedAt() の動作をまとめるテストグループ
describe('Sort Knowledge by updatedAt', () => {
  it('updatedAt の新しい順（降順）に並び替える', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const oldest = Knowledge.create('古い記事', '本文1', 'author-1');

    vi.advanceTimersByTime(10_000);
    const middle = Knowledge.create('中間の記事', '本文2', 'author-1');

    vi.advanceTimersByTime(10_000);
    const newest = Knowledge.create('新しい記事', '本文3', 'author-1');

    expect(Knowledge.sortByUpdatedAt([oldest, newest, middle])).toEqual([newest, middle, oldest]);
  });

  it('既存ナレッジを更新すると、更新したナレッジが先頭に来る', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const first = Knowledge.create('最初に作成', '本文1', 'author-1');

    vi.advanceTimersByTime(10_000);
    const second = Knowledge.create('2番目に作成', '本文2', 'author-1');

    vi.advanceTimersByTime(10_000);
    const updatedFirst = Knowledge.update(first, '更新後の本文1');

    expect(Knowledge.sortByUpdatedAt([second, updatedFirst])).toEqual([updatedFirst, second]);
  });

  it('updatedAt が同じ場合は createdAt 降順・knowledgeId 昇順で安定して並ぶ', () => {
    const olderCreated: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'a-id',
      title: '作成が古い',
      content: '本文',
      authorId: 'author-1',
      createdAt: 100,
      updatedAt: 200,
    };
    const newerCreatedB: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'b-id',
      title: '作成が新しい B',
      content: '本文',
      authorId: 'author-1',
      createdAt: 150,
      updatedAt: 200,
    };
    const newerCreatedA: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'a-id',
      title: '作成が新しい A',
      content: '本文',
      authorId: 'author-1',
      createdAt: 150,
      updatedAt: 200,
    };

    expect(Knowledge.sortByUpdatedAt([olderCreated, newerCreatedB, newerCreatedA])).toEqual([
      newerCreatedA,
      newerCreatedB,
      olderCreated,
    ]);
  });

  it('元の配列を変更せず新しい配列を返す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const older = Knowledge.create('古い記事', '本文1', 'author-1');

    vi.advanceTimersByTime(10_000);
    const newer = Knowledge.create('新しい記事', '本文2', 'author-1');

    const input = [older, newer];
    const sorted = Knowledge.sortByUpdatedAt(input);

    expect(sorted).toEqual([newer, older]);
    expect(sorted).not.toBe(input);
    expect(input).toEqual([older, newer]);
  });

  it('空配列や 1 件のみの配列でも正常に動作する', () => {
    const single = Knowledge.create('1件だけ', '本文', 'author-1');

    expect(Knowledge.sortByUpdatedAt([])).toEqual([]);
    expect(Knowledge.sortByUpdatedAt([single])).toEqual([single]);
  });
});
