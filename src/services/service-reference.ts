export interface ServiceReference {
  id: number;
  name: string;
  slug: string;
}

function normalizeServiceReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]*api$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function differsByOneCharacter(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return (
    differences +
      Number(leftIndex < left.length || rightIndex < right.length) <=
    1
  );
}

export function findServiceByReference<T extends ServiceReference>(
  reference: string,
  services: T[],
): T | undefined {
  const normalized = normalizeServiceReference(reference);
  if (!normalized) return undefined;
  const exactMatches = services.filter(
    (service) =>
      normalizeServiceReference(service.slug) === normalized ||
      normalizeServiceReference(service.name) === normalized,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1 || normalized.length < 5) return undefined;
  const closeMatches = services.filter((service) =>
    [service.slug, service.name].some((candidate) =>
      differsByOneCharacter(normalizeServiceReference(candidate), normalized),
    ),
  );
  return closeMatches.length === 1 ? closeMatches[0] : undefined;
}
