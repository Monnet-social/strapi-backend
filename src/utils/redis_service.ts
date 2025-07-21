import { createClient, RedisClientType } from 'redis';
import HelperService from './helper_service';

export default class RedisService {
    static client: RedisClientType;

    static async connect() {
        let url = ""
        if (!process.env.REDIS_PASSWORD || process.env.REDIS_PASSWORD === "") {
            url = `redis://default@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
        } else {
            url = `redis://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
        }
        this.client = createClient({
            url,
            name: "qbeedesk",
        });

        this.client.on('connect', () => {
            console.log('Connected to Redis successfully');
        });

        this.client.on('error', (error: any) => {
            HelperService.handleError(error, "Error connecting to Redis");
        });

        await this.client.connect();
    }

    static async disconnect() {
        await this.client.disconnect();
    }
}