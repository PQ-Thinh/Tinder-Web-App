import { de } from '@faker-js/faker'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export default async function proxy(request: NextRequest) {
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

    const { data: { user } } = await supabase.auth.getUser()

    // 1. CHẶN NGƯỜI DÙNG CHƯA ĐĂNG NHẬP
    if (!user && !request.nextUrl.pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/auth', request.url))
    }

    // 2. LOGIC PROFILE (Chỉ chạy khi đã login)
    if (user) {
        if (request.nextUrl.pathname.startsWith('/auth')) {
            return NextResponse.redirect(new URL('/', request.url))
        }

        const { data: userProfile } = await supabase
            .from('users')
            .select('is_profile_completed')
            .eq('id', user.id)
            .single()

        const isCompleted = userProfile?.is_profile_completed
        const isEditingProfile = request.nextUrl.pathname === '/profile/edit'
        const isStaticAsset = request.nextUrl.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js)$/)

        if (!isCompleted && !isEditingProfile && !isStaticAsset) {
            return NextResponse.redirect(new URL('/profile/edit', request.url))
        }
    }

    return response
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}