import { IAlgoControl } from "../../types/algo_control";
import RedisService from "./redis_service";

export default class AlgorithmControlService {
    async processPostCreation(postId: string) {
        const postDetails = await strapi.documents("api::post.post").findOne({
            documentId: postId,
            populate: {
                posted_by: true,
                tagged_users: true,
            }
        });
        if (!postDetails) {
            throw new Error(`Post with ID ${postId} not found`);
        }

        const primaryUsers = [];
        primaryUsers.push(postDetails.posted_by.documentId);
        if (postDetails.tagged_users && postDetails.tagged_users.length > 0) {
            postDetails.tagged_users.forEach((user: any) => {
                primaryUsers.push(user.documentId);
            });
        }

        const fanOutUsers = new Set<string>();
        for (const userId of primaryUsers) {
            const followers = await this.fetchFollowers(userId);
            if (followers && followers.length > 0) {
                followers.forEach(followerId => fanOutUsers.add(followerId));
            }
        }

        for (const userId of fanOutUsers) {
            await this.storePostInUserFeed(postId, userId);
        }
        console.log(`Post ${postId} has been processed and stored in user feeds.`);
    }

    async storePostInUserFeed(postId: string, userId: string) {
        const key = `user_feed:${userId}`;
        await RedisService.client.zAdd(key, {
            score: Date.now(), // TODO: Use a more appropriate score based on your requirements
            value: postId,
        });
    }

    async storePostInUserDiscovery(postId: string, userId: string) {
        const key = `user_discovery:${userId}`;
        await RedisService.client.zAdd(key, {
            score: Date.now(), // TODO: Use a more appropriate score based on your requirements
            value: postId,
        });
    }

    async fetchFollowers(userId: string): Promise<string[]> {
        const followesEntries = await strapi.documents("api::following.following").findMany({
            filters: {
                subject: { documentId: userId },
            },
            populate: {
                follower: true,
            },
        });

        const followerIds = followesEntries
            .filter(entry => entry.follower)
            .map(entry => entry.follower.documentId);

        return followerIds;
    }

    async fetchPostsForUser(userId: string): Promise<string[]> {
        const key = `user_feed:${userId}`;
        const posts = await RedisService.client.zRange(key, 0, -1);
        return posts;
    }

    async setAlgorithmControlDetails(userId: string, details: IAlgoControl) {
        await RedisService.client.hSet("algorithm_control", userId, JSON.stringify(details));
    }

    async getAlgorithmControlDetails(userId: string): Promise<IAlgoControl | null> {
        const details = await RedisService.client.hGet("algorithm_control", userId);
        return details ? JSON.parse(details as string) : null;
    }
}
