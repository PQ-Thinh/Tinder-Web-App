import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function middleware(request: NextRequest) {
    // Khởi tạo response
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Lấy user
    const { data: { user } } = await supabase.auth.getUser()
    const path = request.nextUrl.pathname

    // --- LOG DEBUG QUAN TRỌNG ---
    // Xem chính xác path trên Vercel là gì (có thể là /profile/edit/ hoặc /en/profile/edit...)
    // console.log(`[Middleware Check] Path: '${path}' | User: ${user?.id ? 'Logged In' : 'Guest'}`);

    // LOGIC CHO GUEST
    if (!user) {
        const isPublicRoute = path.startsWith('/auth') || path === '/'
        if (!isPublicRoute) {
            return NextResponse.redirect(new URL('/auth', request.url))
        }
    }

    // LOGIC CHO USER
    if (user) {
        if (path.startsWith('/auth')) {
            console.log(`[Middleware] User ${user.id} tried accessing /auth -> Force Home`)
            return NextResponse.redirect(new URL('/', request.url))
        }
        // Lấy thông tin profile
        // Dùng maybeSingle() để an toàn hơn (tránh lỗi nếu chưa có row)
        const { data: userProfile } = await supabase
            .from('users')
            .select('is_profile_completed')
            .eq('id', user.id)
            .maybeSingle()

        const isCompleted = userProfile?.is_profile_completed || false;

        // --- ĐIỂM SỬA QUAN TRỌNG 1: Check Path linh hoạt hơn ---
        // Dùng .startsWith thay vì === để bắt cả trường hợp '/profile/edit/' (có dấu / cuối)
        // hoặc các sub-path con nếu có.
        const isEditingProfile = path.startsWith('/profile/edit')

        const isStaticAsset = path.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2)$/)

        if (!isCompleted && !isEditingProfile && !isStaticAsset) {
            console.log(`[Middleware] BLOCKED: Path '${path}' is not edit page. Redirecting to /profile/edit`);

            const redirectUrl = new URL('/profile/edit', request.url);
            const redirectResponse = NextResponse.redirect(redirectUrl);

            // --- ĐIỂM SỬA QUAN TRỌNG 2: Copy Cookie cẩn thận hơn ---
            // Chỉ copy những cookie quan trọng của Supabase để tránh header quá lớn hoặc xung đột
            const cookiesToSet = response.cookies.getAll();
            cookiesToSet.forEach(cookie => {
                redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
            });

            return redirectResponse;
        }
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}