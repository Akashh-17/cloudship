import {randomUUID} from "crypto";
export function generateDeploymentID(){
    return `dep_${randomUUID()}`;
}