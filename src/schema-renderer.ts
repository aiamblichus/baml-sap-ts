/**
 * Schema Renderer - Converts TypeBox schemas to LLM prompt instructions
 *
 * This is the TypeScript equivalent of BAML's render_output_format.rs
 * It generates schema instructions that guide the LLM to output correctly
 * structured data.
 */

import {
	Kind,
	type TArray,
	type TBoolean,
	type TEnum,
	type TInteger,
	type TLiteral,
	type TNumber,
	type TObject,
	type TOptional,
	type TProperties,
	type TRecord,
	type TRef,
	type TSchema,
	type TString,
	type TTuple,
	type TUnion,
} from "@sinclair/typebox";

export interface SchemaRenderOptions {
	/** Include field descriptions in output */
	includeDescriptions?: boolean;
	/** Indentation level for formatting */
	indent?: number;
	/** Maximum depth for nested structures */
	maxDepth?: number;
	/** Whether to allow partial outputs (for streaming) */
	allowPartials?: boolean;
}

const defaultOptions: SchemaRenderOptions = {
	includeDescriptions: true,
	indent: 2,
	maxDepth: 50,
	allowPartials: false,
};

/**
 * Render a TypeBox schema as prompt instructions
 */
export function renderSchema(schema: TSchema, options: SchemaRenderOptions = {}): string {
	const opts = { ...defaultOptions, ...options };
	const visited = new WeakSet<TSchema>();

	try {
		const rendered = renderSchemaInternal(schema, opts, 0, visited);
		return formatOutput(rendered, schema, opts);
	} finally {
		// Cleanup visited set
		visited.delete(schema);
	}
}

/**
 * Main schema rendering function
 */
function renderSchemaInternal(
	schema: TSchema,
	options: SchemaRenderOptions,
	depth: number,
	visited: WeakSet<TSchema>,
): string {
	// Circular reference / max depth check
	if (depth > options.maxDepth! || visited.has(schema)) {
		return "<recursive>";
	}

	// Mark as visited for this render pass
	visited.add(schema);

	try {
		// Handle schema references
		if (schema.$ref) {
			return `<reference to: ${schema.$ref}>`;
		}

		// Handle different schema kinds
		switch (schema[Kind]) {
			case "Object":
				return renderObject(schema as TObject, options, depth, visited);

			case "Array":
				return renderArray(schema as TArray, options, depth, visited);

			case "Union":
				return renderUnion(schema as TUnion, options, depth, visited);

			case "Intersect":
				return renderIntersect(schema as TSchema, options, depth, visited);

			case "Optional":
				return renderOptional(schema as TOptional<TSchema>, options, depth, visited);

			case "Literal":
				return renderLiteral(schema as TLiteral);

			case "Enum":
				return renderEnum(schema as TEnum);

			case "String":
				return renderString(schema as TString);

			case "Number":
			case "Integer":
				return renderNumber(schema as TNumber | TInteger);

			case "Boolean":
				return renderBoolean(schema as TBoolean);

			case "Null":
				return "null";

			case "Any":
			case "Unknown":
				return "any";

			case "Record":
				return renderRecord(schema as TRecord, options, depth, visited);

			case "Tuple":
				return renderTuple(schema as TTuple, options, depth, visited);

			case "Ref":
				return renderRef(schema as TRef);

			default:
				// Handle primitive types that might not have Kind set
				if (schema.type) {
					return renderJsonSchemaType(schema, options, depth, visited);
				}
				return "<unknown type>";
		}
	} finally {
		visited.delete(schema);
	}
}

function renderObject(schema: TObject, options: SchemaRenderOptions, depth: number, visited: WeakSet<TSchema>): string {
	const properties = schema.properties as TProperties;
	if (!properties || Object.keys(properties).length === 0) {
		return "{}";
	}

	const indent = " ".repeat(options.indent! * (depth + 1));
	const closeIndent = " ".repeat(options.indent! * depth);

	const fields = Object.entries(properties).map(([key, propSchema]) => {
		const isOptional = isOptionalProperty(propSchema);
		const typeStr = renderSchemaInternal(propSchema, options, depth + 1, visited);
		const description =
			options.includeDescriptions && (propSchema as TSchema).description
				? ` // ${(propSchema as TSchema).description}`
				: "";

		return `${indent}"${key}": ${typeStr}${isOptional ? " (optional)" : ""}${description}`;
	});

	return `{\n${fields.join(",\n")}${closeIndent}\n${closeIndent}}`;
}

function renderArray(schema: TArray, options: SchemaRenderOptions, depth: number, visited: WeakSet<TSchema>): string {
	const items = schema.items as TSchema;
	if (!items) {
		return "any[]";
	}

	const itemStr = renderSchemaInternal(items, options, depth, visited);
	return `${itemStr}[]`;
}

function renderUnion(schema: TUnion, options: SchemaRenderOptions, depth: number, visited: WeakSet<TSchema>): string {
	const anyOf = schema.anyOf as TSchema[];
	if (!anyOf || anyOf.length === 0) {
		return "any";
	}

	const variants = anyOf.map((s) => renderSchemaInternal(s, options, depth, visited));

	if (variants.length === 1) {
		return variants[0];
	}

	// For simple unions, use oneOf format
	if (variants.every((v) => !v.includes("\n"))) {
		return variants.join(" | ");
	}

	// For complex unions, use structured format
	const indent = " ".repeat(options.indent! * (depth + 1));
	return `one of:\n${variants.map((v, i) => `${indent}${i + 1}. ${v}`).join("\n")}`;
}

function renderIntersect(
	schema: TSchema,
	options: SchemaRenderOptions,
	depth: number,
	visited: WeakSet<TSchema>,
): string {
	const allOf = (schema as any).allOf as TSchema[];
	if (!allOf || allOf.length === 0) {
		return "{}";
	}

	// Merge all object schemas
	const merged: Record<string, TSchema> = {};
	for (const subSchema of allOf) {
		if (subSchema[Kind] === "Object") {
			const props = (subSchema as TObject).properties as TProperties;
			Object.assign(merged, props);
		}
	}

	// Create a merged object schema
	const mergedSchema: TObject = {
		[Kind]: "Object",
		type: "object",
		properties: merged,
	} as TObject;

	return renderObject(mergedSchema, options, depth, visited);
}

function renderOptional(
	schema: TOptional<TSchema>,
	options: SchemaRenderOptions,
	depth: number,
	visited: WeakSet<TSchema>,
): string {
	const inner = (schema as any).item as TSchema;
	if (!inner) {
		return "any?";
	}
	return renderSchemaInternal(inner, options, depth, visited);
}

function renderLiteral(schema: TLiteral): string {
	const value = (schema as any).const;
	if (typeof value === "string") {
		return `"${value}"`;
	}
	return String(value);
}

function renderEnum(schema: TEnum): string {
	const values = (schema as any).enum as (string | number)[];
	if (!values || values.length === 0) {
		return "<empty enum>";
	}

	return values.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ");
}

function renderString(schema: TString): string {
	const constraints: string[] = [];

	if (schema.minLength !== undefined) {
		constraints.push(`min ${schema.minLength} chars`);
	}
	if (schema.maxLength !== undefined) {
		constraints.push(`max ${schema.maxLength} chars`);
	}
	if (schema.pattern) {
		constraints.push(`matches /${schema.pattern}/`);
	}
	if (schema.format) {
		constraints.push(`format: ${schema.format}`);
	}

	if (constraints.length > 0) {
		return `string (${constraints.join(", ")})`;
	}
	return "string";
}

function renderNumber(schema: TNumber | TInteger): string {
	const isInt = schema[Kind] === "Integer" || (schema as unknown as TInteger).type === "integer";
	const typeName = isInt ? "integer" : "number";
	const constraints: string[] = [];

	if (schema.minimum !== undefined) {
		constraints.push(`>= ${schema.minimum}`);
	}
	if (schema.maximum !== undefined) {
		constraints.push(`<= ${schema.maximum}`);
	}
	if (schema.exclusiveMinimum !== undefined) {
		constraints.push(`> ${schema.exclusiveMinimum}`);
	}
	if (schema.exclusiveMaximum !== undefined) {
		constraints.push(`< ${schema.exclusiveMaximum}`);
	}
	if ((schema as TInteger).multipleOf !== undefined) {
		constraints.push(`multiple of ${(schema as TInteger).multipleOf}`);
	}

	if (constraints.length > 0) {
		return `${typeName} (${constraints.join(", ")})`;
	}
	return typeName;
}

function renderBoolean(_schema: TBoolean): string {
	return "boolean";
}

function renderRecord(schema: TRecord, options: SchemaRenderOptions, depth: number, visited: WeakSet<TSchema>): string {
	const pattern = (schema as any).patternProperties as Record<string, TSchema>;
	const additional = (schema as any).additionalProperties as TSchema;

	let valueType: string;
	if (pattern && Object.keys(pattern).length > 0) {
		const keyPattern = Object.keys(pattern)[0];
		valueType = renderSchemaInternal(pattern[keyPattern], options, depth, visited);
	} else if (additional) {
		valueType = renderSchemaInternal(additional, options, depth, visited);
	} else {
		valueType = "any";
	}

	return `Record<string, ${valueType}>`;
}

function renderTuple(schema: TTuple, options: SchemaRenderOptions, depth: number, visited: WeakSet<TSchema>): string {
	const items = schema.items as TSchema[];
	if (!items || items.length === 0) {
		return "[]";
	}

	const rendered = items.map((item) => renderSchemaInternal(item, options, depth, visited));
	return `[${rendered.join(", ")}]`;
}

function renderRef(schema: TRef): string {
	const ref = (schema as any).$ref as string;
	return ref ? `<${ref}>` : "<reference>";
}

function renderJsonSchemaType(
	schema: any,
	options: SchemaRenderOptions,
	depth: number,
	visited: WeakSet<TSchema>,
): string {
	const type = schema.type;

	switch (type) {
		case "string":
			return renderString(schema as TString);
		case "number":
			return renderNumber(schema as TNumber);
		case "integer":
			return renderNumber(schema as TInteger);
		case "boolean":
			return "boolean";
		case "null":
			return "null";
		case "array":
			if (schema.items) {
				const itemStr = renderSchemaInternal(schema.items, options, depth, visited);
				return `${itemStr}[]`;
			}
			return "any[]";
		case "object":
			if (schema.properties) {
				return renderObject(schema as TObject, options, depth, visited);
			}
			return "{}";
		default:
			return String(type) || "any";
	}
}

function isOptionalProperty(schema: TSchema): boolean {
	// Check if it's an optional type
	if (schema[Kind] === "Optional") {
		return true;
	}

	// Check for nullable
	if (schema.anyOf) {
		const variants = schema.anyOf as TSchema[];
		return variants.some((v) => v[Kind] === "Null" || v.type === "null");
	}

	return false;
}

/**
 * Format the final output with schema instructions
 */
function formatOutput(rendered: string, _schema: TSchema, options: SchemaRenderOptions): string {
	const lines: string[] = [];

	lines.push("Respond with a JSON object in the following format:");
	lines.push("");
	lines.push("```json");
	lines.push(rendered);
	lines.push("```");

	if (options.allowPartials) {
		lines.push("");
		lines.push("Note: If streaming, partial JSON is acceptable.");
	}

	return lines.join("\n");
}

/**
 * Create a prompt with schema instructions appended
 */
export function createPromptWithSchema(basePrompt: string, schema: TSchema, options?: SchemaRenderOptions): string {
	const schemaInstructions = renderSchema(schema, options);

	return `${basePrompt.trim()}\n\n${schemaInstructions}`;
}

/**
 * Create a compact JSON schema representation for the prompt
 * This is an alternative to the human-readable format above
 */
export function createJsonSchemaPrompt(
	basePrompt: string,
	schema: TSchema,
	_options: { includeExamples?: boolean } = {},
): string {
	const jsonSchema = JSON.stringify(schema, null, 2);

	let prompt = `${basePrompt.trim()}\n\nRespond with a JSON object matching this schema:\n\n`;
	prompt += "```json\n";
	prompt += jsonSchema;
	prompt += "\n```";

	return prompt;
}
