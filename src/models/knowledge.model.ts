import { randomUUID } from 'node:crypto';

/**
 * ナレッジのドメインモデル
 */
export interface Knowledge {
  readonly __tag: 'Knowledge';

  /**
   * ナレッジの一意な ID
   *
   * @todo (学生向け，発展課題) Nominal Type を使って型安全にする
   */
  readonly knowledgeId: string;

  /**
   * ナレッジの作成者の ID
   *
   * @todo (学生向け，発展課題) Nominal Type を使って型安全にする
   */
  readonly authorId: string;

  /**
   * ナレッジのタイトル
   */
  readonly title: string;

  /**
   * ナレッジの本文 (Markdown)
   *
   * @todo (学生向け) 空白の場合は不正な Knowledge とみなす
   */
  readonly content: string;

  /**
   * ナレッジの作成日時 (UNIX タイムスタンプ)
   */
  readonly createdAt: number;

  /**
   * ナレッジの更新日時 (UNIX タイムスタンプ)
   */
  readonly updatedAt: number;
}

export class KnowledgeValidationError extends Error {}

export class KnowledgeTitleRequiredError extends KnowledgeValidationError {
  constructor() {
    super('タイトルを入力してください');
    this.name = 'KnowledgeTitleRequiredError';
  }
}

export class KnowledgeContentRequiredError extends KnowledgeValidationError {
  constructor() {
    super('本文を入力してください');
    this.name = 'KnowledgeContentRequiredError';
  }
}

/**
 * ナレッジを新規作成する
 *
 * @param title ナレッジのタイトル
 * @param content ナレッジの本文
 * @param authorId ナレッジの作成者の ID
 * @returns 新規作成されたナレッジ
 */
function create(title: Knowledge['title'], content: Knowledge['content'], authorId: Knowledge['authorId']): Knowledge {
  if (title.trim() === '') {
    throw new KnowledgeTitleRequiredError();
  }

  if (content.trim() === '') {
    throw new KnowledgeContentRequiredError();
  }

  const now = Math.floor(Date.now() / 1000);

  return {
    __tag: 'Knowledge',
    knowledgeId: randomUUID(),
    title,
    content,
    authorId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * ナレッジを更新する
 *
 * @param knowledge 更新対象のナレッジ
 * @param content 新しいナレッジの本文
 * @returns 更新されたナレッジ
 */
function update(self: Knowledge, content: Knowledge['content']): Knowledge {
  if (content.trim() === '') {
    throw new KnowledgeContentRequiredError();
  }

  return {
    ...self,
    content,
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * ナレッジを更新日時の新しい順（降順）に並び替える
 *
 * @param knowledges 並び替え対象のナレッジ配列
 * @returns 更新日時降順に並び替えた新しい配列
 */
function sortByUpdatedAt(knowledges: readonly Knowledge[]): Knowledge[] {
  return knowledges.toSorted((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
    return a.knowledgeId.localeCompare(b.knowledgeId);
  });
}

export const Knowledge = {
  create,
  update,
  sortByUpdatedAt,
};
