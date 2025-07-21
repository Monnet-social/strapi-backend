export interface IAlgoControl {
    friends: number;
    followings: number;
    recommendations: number;
    distance: number;
    categories_entry: {
        category: {
            name: string;
        };
        weightage: number;
    }[];
}