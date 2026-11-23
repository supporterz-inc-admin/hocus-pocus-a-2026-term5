import { KnowledgeListFeature } from '../features/KnowledgeListFeature.js';
import { Knowledge } from '../models/knowledge.model.js';
import { KnowledgeRepository } from '../models/knowledge.repository.js';

export async function getAllKnowledgesController(userName: string) {
  const knowledges = Knowledge.sortByUpdatedAt(await KnowledgeRepository.getAll());

  return <KnowledgeListFeature knowledges={knowledges} userName={userName} />;
}
