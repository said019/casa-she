
interface PlaylistMetadata {
    title?: string;
    thumbnail?: string;
    author?: string;
}

export async function fetchPlaylistMetadata(url: string): Promise<PlaylistMetadata> {
    if (!url) return {};

    let metadata: PlaylistMetadata = {};

    try {
        // Spotify oEmbed
        if (url.includes('spotify.com')) {
            const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
            const response = await fetch(oembedUrl);
            if (response.ok) {
                const data = await response.json();
                metadata = {
                    title: data.title,
                    thumbnail: data.thumbnail_url,
                    author: data.provider_name
                };
            }
        }
        // YouTube oEmbed
        else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
            const response = await fetch(oembedUrl);
            if (response.ok) {
                const data = await response.json();
                metadata = {
                    title: data.title,
                    thumbnail: data.thumbnail_url,
                    author: data.author_name
                };
            }
        }
        // Apple Music (basic parsing)
        else if (url.includes('music.apple.com')) {
            const match = url.match(/\/playlist\/([^\/]+)/);
            if (match) {
                metadata = {
                    title: decodeURIComponent(match[1].replace(/-/g, ' ')),
                    author: 'Apple Music'
                };
            }
        }
    } catch (error) {
        console.error('Error fetching playlist metadata:', error);
    }

    return metadata;
}
