import path from 'node:path';
import { UserInputError } from '../domain/errors.js';
import { fileExists, readText } from '../infrastructure/filesystem/index.js';
import { isProjectDocumentApproved } from '../domain/project/document.mjs';
import {
  prdExperienceRelevance,
  validatePrdDocument,
  type ExperienceRelevance
} from '../domain/project/product-requirements-document.mjs';
import { validateExperienceDocument } from '../domain/project/experience-document.mjs';
import { validateEngineeringDocument } from '../domain/project/engineering-document.mjs';

export type ProjectContractKind = 'prd' | 'experience' | 'engineering';

export interface ProjectContractStatus {
  kind: ProjectContractKind;
  ref: string;
  exists: boolean;
  valid: boolean;
  approved: boolean;
  text?: string;
  experience?: ExperienceRelevance;
}

const CONTRACTS = {
  prd: {
    ref: '_flow/docs/prd.md',
    validate: validatePrdDocument
  },
  experience: {
    ref: '_flow/docs/experience.md',
    validate: validateExperienceDocument
  },
  engineering: {
    ref: '_flow/docs/engineering.md',
    validate: validateEngineeringDocument
  }
} as const;

export function inspectProjectContract(root: string, kind: ProjectContractKind): ProjectContractStatus {
  const contract = CONTRACTS[kind];
  const file = path.join(root, contract.ref);
  if (!fileExists(file)) return { kind, ref: contract.ref, exists: false, valid: false, approved: false };

  const text = readText(file);
  const validation = contract.validate(text);
  const base: ProjectContractStatus = {
    kind,
    ref: contract.ref,
    exists: true,
    valid: validation.errors.length === 0,
    approved: validation.errors.length === 0 && isProjectDocumentApproved(text),
    text
  };

  if (kind === 'prd' && validation.errors.length === 0) {
    return { ...base, experience: prdExperienceRelevance(text) };
  }

  return base;
}

export function requiredProjectContracts(root: string): ProjectContractStatus[] {
  const prd = inspectProjectContract(root, 'prd');
  if (!prd.approved) return [prd];

  const contracts: ProjectContractStatus[] = [prd];
  if (prd.experience === 'required') contracts.push(inspectProjectContract(root, 'experience'));
  contracts.push(inspectProjectContract(root, 'engineering'));
  return contracts;
}

export function assertProjectContractsAuthorized(root: string): void {
  const unauthorized = requiredProjectContracts(root).find((contract) => !contract.approved);
  if (!unauthorized) return;

  throw new UserInputError(
    `${unauthorized.ref} is not authorized at its current exact revision. Approve the current canonical document before downstream mutation.`
  );
}

export function canonicalProjectDocumentKind(target: string): ProjectContractKind | null {
  const normalized = target.replaceAll('\\', '/').replace(/^\.\//, '');
  for (const [kind, contract] of Object.entries(CONTRACTS) as Array<
    [ProjectContractKind, (typeof CONTRACTS)[ProjectContractKind]]
  >) {
    if (normalized === contract.ref) return kind;
  }
  return null;
}

export function validateProjectDocument(kind: ProjectContractKind, text: string): string[] {
  return CONTRACTS[kind].validate(text).errors;
}
