import { DocumentNode, GraphQLSchema } from 'graphql';
export declare function buildPathFromOperation({ url, schema, operation, useRequestBody, }: {
    url: string;
    schema: GraphQLSchema;
    operation: DocumentNode;
    useRequestBody: boolean;
}): any;
