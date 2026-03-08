"""ml_app URL configuration."""

from django.urls import path

from . import views

app_name = 'ml_app'
handler404 = views.handler404

urlpatterns = [
    path('', views.home, name='home'),
    path('upload/', views.upload_video, name='upload'),
    path('predict/', views.predict, name='predict'),
    path('history/', views.history, name='history'),
    path('live/', views.live_camera, name='live'),
    path('screen/', views.screen_analyze_page, name='screen_analyze'),
    path('analyze-frame/', views.analyze_frame, name='analyze_frame'),
    path('analyze-screen/', views.analyze_screen, name='analyze_screen'),

    # API endpoints for Chrome extension and programmatic access
    path('api/analyze-video/', views.api_analyze_video, name='api_analyze_video'),
    path('api/analyze-screen/', views.api_analyze_screen, name='api_analyze_screen'),
    path('api/analyze-frame/', views.api_analyze_frame, name='api_analyze_frame'),
    path('api/status/', views.api_status, name='api_status'),

    # Optional extra pages already present in this repo
    path('about/', views.about, name='about'),
    path('cuda_full/', views.cuda_full, name='cuda_full'),
]
