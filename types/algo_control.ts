export interface IAlgoControl {
    friends: number; // 0 to 100
    followers: number; // 0 to 100
    recommendations: number; // 0 to 100
    distance: number; // 0 to 100
    categories_entry: {
        category: {
            name: string;
        };
        weightage: number; // 0 to 100
    }[];
}