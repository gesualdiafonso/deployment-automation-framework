/** The subset of an OpenAPI 3.1 document that the API Explorer reads. */

export interface JsonSchema {
  readonly $ref?: string
  readonly type?: string
  readonly title?: string
  readonly description?: string
  readonly pattern?: string
  readonly enum?: readonly unknown[]
  readonly examples?: readonly unknown[]
  readonly properties?: Readonly<Record<string, JsonSchema>>
  readonly required?: readonly string[]
  readonly items?: JsonSchema
  readonly additionalProperties?: boolean | JsonSchema
}

export interface OpenApiParameter {
  readonly name: string
  readonly in: 'path' | 'query' | 'header' | 'cookie'
  readonly required?: boolean
  readonly description?: string
  readonly schema?: JsonSchema
}

export interface OpenApiResponse {
  readonly description?: string
  readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>>
}

export interface OpenApiOperation {
  readonly summary?: string
  readonly description?: string
  readonly parameters?: readonly OpenApiParameter[]
  readonly requestBody?: { readonly content?: Readonly<Record<string, { readonly schema?: JsonSchema }>> }
  readonly responses?: Readonly<Record<string, OpenApiResponse>>
}

export interface OpenApiDocument {
  readonly openapi: string
  readonly info: { readonly title: string; readonly version: string; readonly description?: string }
  readonly paths: Readonly<Record<string, Readonly<Record<string, OpenApiOperation>>>>
  readonly components?: { readonly schemas?: Readonly<Record<string, JsonSchema>> }
}
