import { DocumentNode, OperationDefinitionNode, VariableDefinitionNode } from 'graphql';
export declare type OperationInfo = {
    operation: OperationDefinitionNode;
    variables: ReadonlyArray<VariableDefinitionNode>;
    name: string;
} | undefined;
export declare function getOperationInfo(doc: DocumentNode): OperationInfo;
