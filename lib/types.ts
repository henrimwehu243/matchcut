export type Profile = {
  id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at?: string;
};

export type Title = {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  overview: string;
  posterPath: string | null;
  year: string;
  genreIds: number[];
  language: string;
  anime: boolean;
  popularity: number;
  voteAverage?: number;
};

export type WatchItem = {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  year: string | null;
  status: "to_watch" | "watched";
  rating: number | null;
  created_at: string;
};

export type ReviewReaction = {
  id: string;
  review_id: string;
  user_id: string;
  emoji: string;
};

export type ReviewReply = {
  id: string;
  review_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "username" | "full_name">;
};

export type Review = {
  id: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles?: Pick<Profile, "username" | "full_name">;
};

export type DirectMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  tmdb_id: number | null;
  media_type: "movie" | "tv" | null;
  movie_title: string | null;
  poster_path: string | null;
  invite_status: "none" | "pending" | "accepted" | "declined";
  read_at: string | null;
  created_at: string;
};

export type Recommendation = {
  id: string;
  from_user_id: string;
  to_user_id: string | null;
  to_group_id: string | null;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  year: string | null;
  note: string | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_by: string;
  created_at: string;
};

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
};

export type ChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export type SessionPhoto = {
  id: string;
  group_id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};