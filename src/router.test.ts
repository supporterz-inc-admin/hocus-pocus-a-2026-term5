import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteKnowledgeController } from './controllers/delete-knowledge.controller.js';
import { Knowledge } from './models/knowledge.model.js';
import { KnowledgeRepository } from './models/knowledge.repository.js';
import { router, type Variables } from './router.js';

function requestAsUser(path: string, userId: string, init?: RequestInit) {
  const app = new Hono<{ Variables: Variables }>();
  app.use('*', async (ctx, next) => {
    ctx.set('userId', userId);
    ctx.set('userName', userId);
    await next();
  });
  app.route('/', router);

  return app.request(path, init);
}

const requestWithUser = requestAsUser;

function postCreateKnowledge(title: string, content: string) {
  return router.request('/knowledges/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ title, content }),
  });
}

function postEditKnowledge(path: string, content: string, userId: string) {
  return requestWithUser(path, userId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ content }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Create knowledge view', () => {
  it('作成画面にタイトル入力欄と本文入力欄を表示する', async () => {
    const response = await router.request('/knowledges/new');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('タイトル');
    expect(html).toContain('name="title"');
    expect(html).toContain('本文');
    expect(html).toContain('name="content"');
  });
});

describe('Create knowledge validation', () => {
  it('空タイトルを拒否して、入力値とエラーを作成画面に返す', async () => {
    const title = ' \t ';
    const content = '入力済みの本文';
    const response = await postCreateKnowledge(title, content);

    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain('タイトルを入力してください');
    expect(html).toContain(`value="${title}"`);
    expect(html).toContain(`>${content}</textarea>`);
  });

  it('空本文を拒否して、入力値とエラーを作成画面に返す', async () => {
    const title = '入力済みのタイトル';
    const content = ' \t ';
    const response = await postCreateKnowledge(title, content);

    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain('本文を入力してください');
    expect(html).toContain(`value="${title}"`);
    expect(html).toContain(`>${content}</textarea>`);
  });
});

describe('Create knowledge transition', () => {
  it('保存に成功したら、一覧画面へリダイレクトする', async () => {
    const upsert = vi.spyOn(KnowledgeRepository, 'upsert').mockResolvedValue();
    const title = 'Hello Title';
    const content = '# Hello\n\nMarkdown 本文';

    const response = await postCreateKnowledge(title, content);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title, content }));
  });

  it('保存に失敗したら、例外をログに残し、入力値とエラーを作成画面に返す', async () => {
    const failure = new Error('disk full');
    vi.spyOn(KnowledgeRepository, 'upsert').mockRejectedValue(failure);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const title = '保存できないタイトル';
    const content = '保存できない本文';

    const response = await postCreateKnowledge(title, content);

    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('保存に失敗しました');
    expect(html).toContain(`value="${title}"`);
    expect(html).toContain(`>${content}</textarea>`);
    expect(logError).toHaveBeenCalledWith(failure);
  });
});

describe('Knowledge list', () => {
  it('一覧画面にナレッジのタイトルを表示する', async () => {
    const knowledge = Knowledge.create('一覧のタイトル', '一覧の本文', 'list-author');
    vi.spyOn(KnowledgeRepository, 'getAll').mockResolvedValue([knowledge]);

    const response = await router.request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('一覧のタイトル');
  });

  it('一覧画面にナレッジを更新日時の新しい順で表示し、更新日時を出力する', async () => {
    const oldest: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'id-oldest',
      title: '未更新の古いナレッジ',
      content: '本文1',
      authorId: 'author-1',
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_000,
    };
    const middle: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'id-middle',
      title: '新しく作成したナレッジ',
      content: '本文2',
      authorId: 'author-2',
      createdAt: 1_700_000_100,
      updatedAt: 1_700_000_100,
    };
    const recentlyUpdated: Knowledge = {
      __tag: 'Knowledge',
      knowledgeId: 'id-updated',
      title: '更新された古いナレッジ',
      content: '更新後の本文',
      authorId: 'author-1',
      createdAt: 1_699_999_900,
      updatedAt: 1_700_000_200,
    };
    vi.spyOn(KnowledgeRepository, 'getAll').mockResolvedValue([oldest, middle, recentlyUpdated]);

    const response = await router.request('/');
    const html = await response.text();

    expect(response.status).toBe(200);
    const updatedIndex = html.indexOf('更新された古いナレッジ');
    const middleIndex = html.indexOf('新しく作成したナレッジ');
    const oldestIndex = html.indexOf('未更新の古いナレッジ');
    expect(updatedIndex).toBeGreaterThan(-1);
    expect(middleIndex).toBeGreaterThan(updatedIndex);
    expect(oldestIndex).toBeGreaterThan(middleIndex);
    expect(html).toContain(new Date(recentlyUpdated.updatedAt * 1000).toISOString());
  });
});

describe('Knowledge detail', () => {
  it('存在するナレッジのタイトル・本文・作成者を詳細画面に表示する', async () => {
    const knowledge = Knowledge.create('詳細タイトル', '# 詳細\n\n本文の2行目', 'detail-author');
    const getByKnowledgeId = vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await router.request(`/knowledges/${knowledge.knowledgeId}`);

    const html = await response.text();

    expect(response.status).toBe(200);
    expect(getByKnowledgeId).toHaveBeenCalledWith(knowledge.knowledgeId);
    expect(html).toContain('詳細タイトル');
    expect(html).toContain('# 詳細\n\n本文の2行目');
    expect(html).toContain('detail-author');
  });

  it('タイトルと本文の HTML をエスケープして表示する', async () => {
    const knowledge = Knowledge.create('<b>title</b>', '<script>alert(1)</script>', 'detail-author');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await router.request(`/knowledges/${knowledge.knowledgeId}`);

    const html = await response.text();

    expect(html).not.toContain('<b>title</b>');
    expect(html).toContain('&lt;b&gt;title&lt;/b&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('存在しないナレッジは 404 と「ナレッジが見つかりません」画面を返す', async () => {
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(undefined);

    const response = await router.request('/knowledges/does-not-exist');

    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('ナレッジが見つかりません');
    expect(html).toContain('href="/"');
  });

  it('投稿者本人が詳細画面を開いた場合のみ「編集」リンクを表示する', async () => {
    const knowledge = Knowledge.create('詳細タイトル', '本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    // 本人の場合
    const responseForAuthor = await requestWithUser(`/knowledges/${knowledge.knowledgeId}`, 'author-alice');
    const htmlForAuthor = await responseForAuthor.text();
    expect(htmlForAuthor).toContain('編集');
    expect(htmlForAuthor).toContain(`/knowledges/${knowledge.knowledgeId}/edit`);

    // 他人の場合
    const responseForOther = await requestWithUser(`/knowledges/${knowledge.knowledgeId}`, 'author-bob');
    const htmlOther = await responseForOther.text();
    expect(htmlOther).not.toContain(`/knowledges/${knowledge.knowledgeId}/edit`);
  });

  it('投稿者本人が詳細画面を開くと、確認ダイアログ付きの削除フォームを表示する', async () => {
    const knowledge = Knowledge.create('自分のナレッジ', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await requestAsUser(`/knowledges/${knowledge.knowledgeId}`, 'author-1');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(`action="/knowledges/${knowledge.knowledgeId}/delete"`);
    expect(html).toContain('method="post"');
    expect(html).toContain('onsubmit="return confirm(');
    expect(html).toContain('「自分のナレッジ」を削除しますか？');
    expect(html).toContain('削除したナレッジは元に戻せません。');
    expect(html).toContain('type="submit"');
    expect(html).toContain('削除する');
  });

  it('他人には詳細画面に削除フォームを表示しない', async () => {
    const knowledge = Knowledge.create('他人のナレッジ', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await requestAsUser(`/knowledges/${knowledge.knowledgeId}`, 'other-user');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain(`/knowledges/${knowledge.knowledgeId}/delete`);
    expect(html).not.toContain('削除する');
  });

  it('ログインユーザーIDが未設定の場合は削除フォームを表示しない', async () => {
    const knowledge = Knowledge.create('誰かのナレッジ', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await router.request(`/knowledges/${knowledge.knowledgeId}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).not.toContain(`/knowledges/${knowledge.knowledgeId}/delete`);
  });
});

describe('Knowledge edit view', () => {
  it('投稿者本人がアクセスした場合、編集画面に既存の本文を表示する', async () => {
    const knowledge = Knowledge.create('編集テストタイトル', '既存のナレッジ本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await requestWithUser(`/knowledges/${knowledge.knowledgeId}/edit`, 'author-alice');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('編集テストタイトル');
    expect(html).toContain('既存のナレッジ本文');
    expect(html).toContain(`action="/knowledges/${knowledge.knowledgeId}/edit"`);
  });

  it('他人または未ログインユーザーがアクセスした場合、403 を返す', async () => {
    const knowledge = Knowledge.create('編集テストタイトル', '既存のナレッジ本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);

    const response = await requestWithUser(`/knowledges/${knowledge.knowledgeId}/edit`, 'author-bob');

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('権限がありません');
  });

  it('存在しないナレッジの編集画面を開いた場合、404 を返す', async () => {
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(undefined);

    const response = await requestWithUser('/knowledges/does-not-exist/edit', 'author-alice');

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('ナレッジが見つかりません');
  });
});

describe('Knowledge edit transition', () => {
  it('投稿者本人が更新に成功したら、詳細画面へリダイレクトして保存される', async () => {
    const knowledge = Knowledge.create('元のタイトル', '元の本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const upsert = vi.spyOn(KnowledgeRepository, 'upsert').mockResolvedValue();

    const newContent = '更新後の新しい本文';
    const response = await postEditKnowledge(`/knowledges/${knowledge.knowledgeId}/edit`, newContent, 'author-alice');

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`/knowledges/${knowledge.knowledgeId}`);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledgeId: knowledge.knowledgeId,
        title: knowledge.title,
        content: newContent,
        authorId: 'author-alice',
        createdAt: knowledge.createdAt,
      }),
    );
  });

  it('他人による更新リクエストは 403 で拒否され、保存されない', async () => {
    const knowledge = Knowledge.create('元のタイトル', '元の本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const upsert = vi.spyOn(KnowledgeRepository, 'upsert').mockResolvedValue();

    const response = await postEditKnowledge(
      `/knowledges/${knowledge.knowledgeId}/edit`,
      '不正な更新本文',
      'author-bob',
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain('権限がありません');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('存在しないナレッジの更新リクエストは 404 を返す', async () => {
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(undefined);
    const upsert = vi.spyOn(KnowledgeRepository, 'upsert').mockResolvedValue();

    const response = await postEditKnowledge('/knowledges/does-not-exist/edit', '存在しない更新本文', 'author-alice');

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('ナレッジが見つかりません');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('空本文の更新を拒否して、入力値とエラーを編集画面に返す', async () => {
    const knowledge = Knowledge.create('元のタイトル', '元の本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const upsert = vi.spyOn(KnowledgeRepository, 'upsert').mockResolvedValue();

    const invalidContent = '  \t  ';
    const response = await postEditKnowledge(
      `/knowledges/${knowledge.knowledgeId}/edit`,
      invalidContent,
      'author-alice',
    );

    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).toContain('本文を入力してください');
    expect(html).toContain(`>${invalidContent}</textarea>`);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('保存に失敗したら、例外をログに残し、入力値とエラーを編集画面に返す', async () => {
    const knowledge = Knowledge.create('元のタイトル', '元の本文', 'author-alice');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const failure = new Error('disk full');
    vi.spyOn(KnowledgeRepository, 'upsert').mockRejectedValue(failure);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const content = '保存できない更新本文';
    const response = await postEditKnowledge(`/knowledges/${knowledge.knowledgeId}/edit`, content, 'author-alice');

    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('保存に失敗しました');
    expect(html).toContain(`>${content}</textarea>`);
    expect(logError).toHaveBeenCalledWith(failure);
  });
});

describe('Delete knowledge', () => {
  it('投稿者本人が削除すると Repository.deleteByKnowledgeId を呼び出し、一覧へリダイレクトする', async () => {
    const knowledge = Knowledge.create('削除対象', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const deleteByKnowledgeId = vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockResolvedValue();

    const response = await requestAsUser(`/knowledges/${knowledge.knowledgeId}/delete`, 'author-1', { method: 'POST' });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/');
    expect(deleteByKnowledgeId).toHaveBeenCalledWith(knowledge.knowledgeId);
  });

  it('存在しないナレッジの削除要求は削除せず 404 と一覧への導線を返す', async () => {
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(undefined);
    const deleteByKnowledgeId = vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockResolvedValue();

    const response = await requestAsUser('/knowledges/does-not-exist/delete', 'author-1', { method: 'POST' });
    const html = await response.text();

    expect(response.status).toBe(404);
    expect(html).toContain('ナレッジが見つかりません');
    expect(html).toContain('href="/"');
    expect(deleteByKnowledgeId).not.toHaveBeenCalled();
  });

  it('他人による削除要求は削除せず 403 と一覧への導線を返す', async () => {
    const knowledge = Knowledge.create('他人のナレッジ', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const deleteByKnowledgeId = vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockResolvedValue();

    const response = await requestAsUser(`/knowledges/${knowledge.knowledgeId}/delete`, 'other-user', {
      method: 'POST',
    });
    const html = await response.text();

    expect(response.status).toBe(403);
    expect(html).toContain('削除する権限がありません');
    expect(html).toContain('href="/"');
    expect(deleteByKnowledgeId).not.toHaveBeenCalled();
  });

  it('ログインユーザーIDが未設定の削除要求は削除せず 403 を返す', async () => {
    const knowledge = Knowledge.create('誰かのナレッジ', '本文', 'author-1');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    const deleteByKnowledgeId = vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockResolvedValue();

    const response = await router.request(`/knowledges/${knowledge.knowledgeId}/delete`, { method: 'POST' });

    expect(response.status).toBe(403);
    expect(deleteByKnowledgeId).not.toHaveBeenCalled();
  });

  it('ファイル削除に失敗した場合はログを残し、500 と再試行・一覧への導線を返す', async () => {
    const knowledge = Knowledge.create('削除失敗するナレッジ', '本文', 'author-1');
    const failure = new Error('permission denied');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockRejectedValue(failure);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await requestAsUser(`/knowledges/${knowledge.knowledgeId}/delete`, 'author-1', { method: 'POST' });
    const html = await response.text();

    expect(response.status).toBe(500);
    expect(html).toContain('削除に失敗しました');
    expect(html).toContain('href="/"');
    expect(html).toContain(`href="/knowledges/${knowledge.knowledgeId}"`);
    expect(logError).toHaveBeenCalledWith(failure);
  });

  it('削除処理で例外が発生した場合は握りつぶさず呼び出し元へ伝える', async () => {
    const knowledge = Knowledge.create('削除失敗するナレッジ', '本文', 'author-1');
    const failure = new Error('permission denied');
    vi.spyOn(KnowledgeRepository, 'getByKnowledgeId').mockResolvedValue(knowledge);
    vi.spyOn(KnowledgeRepository, 'deleteByKnowledgeId').mockRejectedValue(failure);

    await expect(deleteKnowledgeController(knowledge.knowledgeId, 'author-1')).rejects.toThrow(failure);
  });

  it('テスト用保存先で本人削除を実行すると、一覧と詳細から対象だけが消え、他ナレッジは残る', async () => {
    const originalCwd = process.cwd();
    const tempDir = await mkdtemp(join(tmpdir(), 'hocus-pocus-delete-test-'));

    try {
      process.chdir(tempDir);

      const target = Knowledge.create('削除するナレッジ', '消える本文', 'author-1');
      const other = Knowledge.create('残るナレッジ', '残る本文', 'author-2');
      await KnowledgeRepository.upsert(target);
      await KnowledgeRepository.upsert(other);

      // 別ユーザーでは削除できず、対象が残る
      const forbiddenResponse = await requestAsUser(`/knowledges/${target.knowledgeId}/delete`, 'author-2', {
        method: 'POST',
      });
      expect(forbiddenResponse.status).toBe(403);
      expect((await router.request(`/knowledges/${target.knowledgeId}`)).status).toBe(200);

      // 投稿者本人が削除すると一覧へリダイレクトされる
      const deleteResponse = await requestAsUser(`/knowledges/${target.knowledgeId}/delete`, 'author-1', {
        method: 'POST',
      });
      expect(deleteResponse.status).toBe(302);
      expect(deleteResponse.headers.get('Location')).toBe('/');

      // 削除後の一覧・詳細から対象が消え、他のナレッジは残る
      const listHtml = await (await requestAsUser('/', 'author-1')).text();
      expect(listHtml).not.toContain('削除するナレッジ');
      expect(listHtml).toContain('残るナレッジ');

      const deletedDetailResponse = await requestAsUser(`/knowledges/${target.knowledgeId}`, 'author-1');
      expect(deletedDetailResponse.status).toBe(404);

      const remainingDetailResponse = await requestAsUser(`/knowledges/${other.knowledgeId}`, 'author-1');
      expect(remainingDetailResponse.status).toBe(200);
      expect(await remainingDetailResponse.text()).toContain('残るナレッジ');
    } finally {
      process.chdir(originalCwd);
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
