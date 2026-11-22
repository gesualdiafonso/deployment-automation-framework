import type { JsonSchema, OpenApiDocument, OpenApiOperation } from '@/types/openapi'

import type { RegisteredEndpoint } from './registry'

/** The operation the API publishes for a registered endpoint, or null when the API does not have it. */
export function findOperation(document: OpenApiDocument, endpoint: RegisteredEndpoint): OpenApiOperation | null {
  return document.paths[endpoint.path]?.[endpoint.method.toLowerCase()] ?? null
}

/** Resolves local references (#/components/schemas/Name). Unknown references resolve to an empty schema. */
export function resolveSchema(document: OpenApiDocument, schema: JsonSchema | undefined): JsonSchema {
  if (!schema) return {}
  if (schema.$ref) {
    const name = schema.$ref.replace('#/components/schemas/', '')
    return document.components?.schemas?.[name] ?? {}
  }
  return schema
}

const MAX_DEPTH = 6

/**
 * Builds a placeholder value with the shape of a schema: the schema's own
 * examples or first enum value when it has them, otherwise a type placeholder.
 * It is a shape, not data: the UI labels it as generated.
 */
export function exampleFromSchema(document: OpenApiDocument, input: JsonSchema | undefined, depth = 0): unknown {
  const schema = resolveSchema(document, input)
  if (depth > MAX_DEPTH) return null
  if (schema.examples && schema.examples.length > 0) return schema.examples[0]
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]

  switch (schema.type) {
    case 'object': {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        result[key] = exampleFromSchema(document, value, depth + 1)
      }
      if (!schema.properties && typeof schema.additionalProperties === 'object') {
        result['<key>'] = exampleFromSchema(document, schema.additionalProperties, depth + 1)
      }
      return result
    }
    case 'array':
      return [exampleFromSchema(document, schema.items, depth + 1)]
    case 'integer':
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'string':
      return 'string'
    default:
      return null
  }
}

export function jsonSchemaOf(operationPart: { content?: Readonly<Record<string, { schema?: JsonSchema }>> } | undefined) {
  return operationPart?.content?.['application/json']?.schema
}
